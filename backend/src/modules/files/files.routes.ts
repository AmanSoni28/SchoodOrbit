import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, type AuthUser } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { filePath, saveFile } from '../../lib/storage';
import { offeringAccess } from '../../lib/policies';
import { visibleLesson } from '../content/content.routes';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 } });

const r = Router();

r.post('/files', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to upload');
  const f = await saveFile(req.user!.id, req.file);
  res.status(201).json({ data: { id: f.id, originalName: f.originalName, mimeType: f.mimeType, size: f.size } });
});

// A file is readable by its owner, or through the record it is attached to.
export async function canAccessFile(user: AuthUser, fileId: string) {
  const f = await prisma.fileAsset.findUnique({
    where: { id: fileId },
    include: {
      lessonResources: { include: { lesson: { select: { id: true, offeringId: true } } } },
      submissionFiles: { include: { submission: { include: { assignment: { select: { offeringId: true } } } } } },
      aiSources: { include: { job: { select: { offeringId: true } } } },
    },
  });
  if (!f) return null;
  if (f.ownerId === user.id) return f;
  for (const lr of f.lessonResources) {
    const a = await offeringAccess(user, lr.lesson.offeringId);
    if (a.isInstructor || a.isAdmin) return f;
    if (a.isStudent && (await prisma.lesson.count({ where: { id: lr.lesson.id, ...visibleLesson() } }))) return f;
  }
  for (const sf of f.submissionFiles) {
    const a = await offeringAccess(user, sf.submission.assignment.offeringId);
    if (a.isInstructor || a.isAdmin) return f;
  }
  for (const s of f.aiSources) {
    if ((await offeringAccess(user, s.job.offeringId)).isInstructor) return f;
  }
  // AI homework attachments: owner only (handled above). Everything else: denied.
  return null;
}

r.get('/files/:id/download', async (req, res) => {
  const f = await canAccessFile(req.user!, z.string().uuid().parse(req.params.id));
  if (!f) throw notFound('File not found');
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const inline = f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.originalName)}"`);
  res.sendFile(filePath(f.storageKey));
});

export default r;
