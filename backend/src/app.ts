import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { csrf } from './middleware/csrf';
import { errorHandler, notFound } from './lib/errors';
import routes from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.locals.requestId = req.get('x-request-id')?.slice(0, 64) || crypto.randomUUID();
    res.setHeader('x-request-id', res.locals.requestId);
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/v1', csrf, routes);
  app.use(() => { throw notFound('Route not found'); });
  app.use(errorHandler);
  return app;
}
