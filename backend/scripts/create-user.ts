// Interactive account creation (e.g. the first real Super Admin). Run: npm run create-user -w backend
import 'dotenv/config';
import readline from 'readline';
import { PrismaClient, type RoleName } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/auth.service';

const ROLES: RoleName[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'FACULTY', 'STUDENT', 'PARENT'];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
// Hides typed characters while the password is entered (the prompt itself is written directly).
const out = rl as any;
const write = out._writeToOutput?.bind(out);
if (write) out._writeToOutput = (s: string) => { if (!muted) write(s); };

async function ask(q: string, hidden = false) {
  process.stdout.write(q);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  if (done) throw new Error('Input ended early');
  return (value as string).trim();
}
const askHidden = (q: string) => ask(q, true);

async function main() {
  const prisma = new PrismaClient();
  try {
    const email = (await ask('Email: ')).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email');
    if (await prisma.user.findUnique({ where: { email } })) throw new Error('An account with this email already exists');
    const firstName = await ask('First name: ');
    const lastName = await ask('Last name: ');
    const roleIn = (await ask(`Roles, comma-separated [${ROLES.join(', ')}] (default SUPER_ADMIN): `)) || 'SUPER_ADMIN';
    const roles = roleIn.split(',').map((r) => r.trim().toUpperCase()) as RoleName[];
    if (!roles.every((r) => ROLES.includes(r))) throw new Error('Unknown role');
    const password = await askHidden('Password (min 10 chars, hidden): ');
    if (password.length < 10) throw new Error('Password must be at least 10 characters');
    if ((await askHidden('Confirm password: ')) !== password) throw new Error('Passwords do not match');
    if (!firstName || !lastName) throw new Error('Name is required');
    const u = await prisma.user.create({ data: { email, firstName, lastName, passwordHash: await hashPassword(password), roles: { create: roles.map((role) => ({ role })) } } });
    await prisma.auditLog.create({ data: { action: 'USER_CREATED_CLI', entityType: 'User', entityId: u.id, metadata: { roles } } });
    console.log(`Created ${email} with roles ${roles.join(', ')}. You can sign in now.`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
