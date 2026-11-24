// Vercel serverless entry: the whole Express API runs as this one function.
// vercel.json rewrites /api/* here; Express still sees the original /api/v1/... path.
import { createApp } from '../backend/src/app';

export default createApp();
