import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const PASSWORD = process.env.SEED_PASSWORD || 'Demo@Pass2026';
export const email = (u: string) => `${u}@northbridge.test`;

/** A cookie-holding client that sends the CSRF header like the real frontend does. */
export async function client(user?: string) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
  const withCsrf = (t: request.Test) => t.set('x-csrf-token', csrf);
  const c = {
    agent, csrf,
    get: (p: string) => agent.get(`/api/v1${p}`),
    post: (p: string, body?: object) => withCsrf(agent.post(`/api/v1${p}`)).send(body ?? {}),
    put: (p: string, body?: object) => withCsrf(agent.put(`/api/v1${p}`)).send(body ?? {}),
    patch: (p: string, body?: object) => withCsrf(agent.patch(`/api/v1${p}`)).send(body ?? {}),
    delete: (p: string) => withCsrf(agent.delete(`/api/v1${p}`)),
  };
  if (user) {
    const res = await c.post('/auth/login', { email: email(user), password: PASSWORD });
    if (res.status !== 200) throw new Error(`login ${user} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return c;
}
