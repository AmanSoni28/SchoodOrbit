import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
export const unauthorized = (m = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', m);
export const forbidden = (m = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', m);
export const notFound = (m = 'Not found') => new AppError(404, 'NOT_FOUND', m);
export const conflict = (m: string) => new AppError(409, 'CONFLICT', m);
export const unprocessable = (m: string, d?: unknown) => new AppError(422, 'UNPROCESSABLE', m, d);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = res.locals.requestId;
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, details, requestId } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return send(422, 'VALIDATION', 'Some fields are invalid', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof multer.MulterError) return send(400, 'UPLOAD', err.message);
  if (err?.type === 'entity.parse.failed') return send(400, 'BAD_JSON', 'Malformed JSON body');
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(409, 'CONFLICT', 'This record already exists');
    if (err.code === 'P2025') return send(404, 'NOT_FOUND', 'Not found');
    if (err.code === 'P2003') return send(409, 'CONFLICT', 'Record is referenced by other data');
  }
  console.error(`[${requestId}]`, err);
  send(500, 'INTERNAL', 'Something went wrong');
};
