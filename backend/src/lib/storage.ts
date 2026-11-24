import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import type { Response } from 'express';
import { get as blobGet, put as blobPut } from '@vercel/blob';
import { env } from '../config/env';
import { prisma } from './prisma';
import { badRequest, notFound } from './errors';

// Two drivers behind one API: private Vercel Blob when BLOB_READ_WRITE_TOKEN is set (serverless hosts have no
// persistent disk), otherwise the local STORAGE_DIR. The storageKey is the same shape for both.
const root = path.resolve(env.STORAGE_DIR);
const useBlob = !!env.BLOB_READ_WRITE_TOKEN;

export const ALLOWED_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
export const IMAGE_OR_PDF = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// Magic-byte check so a renamed executable can't pass as a PDF or image.
function sniff(buf: Buffer, mime: string) {
  const hex = buf.subarray(0, 4).toString('hex');
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString() === '%PDF';
  if (mime === 'image/png') return hex === '89504e47';
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/webp') return buf.subarray(8, 12).toString() === 'WEBP';
  if (mime.includes('openxmlformats')) return hex === '504b0304';
  if (mime === 'text/plain') return !buf.subarray(0, 4096).includes(0);
  return false;
}

export async function saveFile(ownerId: string, file: Express.Multer.File, allowed = Object.keys(ALLOWED_MIME)) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(file.mimetype) || !ALLOWED_MIME[file.mimetype]?.includes(ext) || !sniff(file.buffer, file.mimetype)) {
    throw badRequest(`File type not allowed: ${file.originalname}`);
  }
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${ext}`;
  if (useBlob) await blobPut(storageKey, file.buffer, { access: 'private', contentType: file.mimetype });
  else {
    await fs.mkdir(path.join(root, path.dirname(storageKey)), { recursive: true });
    await fs.writeFile(path.join(root, storageKey), file.buffer);
  }
  return prisma.fileAsset.create({
    data: {
      ownerId, storageKey, originalName: file.originalname.slice(0, 200), mimeType: file.mimetype, size: file.size,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    },
  });
}

export const filePath = (storageKey: string) => path.join(root, storageKey);

async function blobStream(storageKey: string) {
  const r = await blobGet(storageKey, { access: 'private' });
  if (!r || r.statusCode !== 200) throw notFound('File not found');
  return r.stream;
}

export async function readStoredFile(storageKey: string) {
  if (!useBlob) return fs.readFile(filePath(storageKey));
  return Buffer.from(await new globalThis.Response(await blobStream(storageKey)).arrayBuffer());
}

/** Streams a stored file into the response. Headers (type, disposition) are set by the caller. */
export async function sendStoredFile(res: Response, storageKey: string) {
  if (!useBlob) return res.sendFile(filePath(storageKey));
  Readable.fromWeb(await blobStream(storageKey) as any).pipe(res);
}
