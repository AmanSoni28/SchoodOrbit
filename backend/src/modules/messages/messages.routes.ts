import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { AppError, forbidden, notFound } from '../../lib/errors';
import { featureEnabled } from '../../lib/settings';
import { canUseMessages, contactWhere, pair } from './messages.service';

const r = Router();
const uuid = z.string().uuid();
const EPOCH = new Date(0);

r.use(['/messages', '/conversations'], (req: Request, _res: Response, next: NextFunction) => next(canUseMessages(req.user!.roles) ? undefined : forbidden('Messaging is not available for your role')));

const person = {
  id: true, firstName: true, lastName: true, email: true,
  roles: { select: { role: true } },
  // Context shown next to a name: which courses a faculty member teaches, whose parent someone is.
  instructorOf: { where: { offering: { status: { not: 'ARCHIVED' } } }, select: { offering: { select: { course: { select: { code: true } } } } }, take: 6 },
  parentLinks: { where: { status: 'ACTIVE' }, select: { student: { select: { firstName: true, lastName: true } } }, take: 3 },
} satisfies Prisma.UserSelect;
type Person = Prisma.UserGetPayload<{ select: typeof person }>;
const card = (u: Person) => ({
  id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email,
  roles: u.roles.map((x) => x.role).filter((x) => x !== 'SUPER_ADMIN'),
  courses: [...new Set(u.instructorOf.map((i) => i.offering.course.code))],
  children: u.parentLinks.map((l) => `${l.student.firstName} ${l.student.lastName}`),
});

const contacts = async (req: Request) => contactWhere(req.user!, await featureEnabled('parentPortal'));
const mineWhere = (me: string): Prisma.ConversationWhereInput => ({ OR: [{ userAId: me }, { userBId: me }] });
const readAt = (c: { userAId: string; aReadAt: Date | null; bReadAt: Date | null }, me: string) => (c.userAId === me ? c.aReadAt : c.bReadAt) ?? EPOCH;

/** Unread message counts per conversation, in one query. */
async function unreadCounts(me: string, convs: { id: string; userAId: string; aReadAt: Date | null; bReadAt: Date | null }[]) {
  if (!convs.length) return new Map<string, number>();
  const rows = await prisma.message.groupBy({
    by: ['conversationId'], _count: { _all: true },
    where: { senderId: { not: me }, OR: convs.map((c) => ({ conversationId: c.id, createdAt: { gt: readAt(c, me) } })) },
  });
  return new Map(rows.map((x) => [x.conversationId, x._count._all]));
}

async function myConversation(id: string, me: string) {
  const c = await prisma.conversation.findUnique({ where: { id }, include: { userA: { select: person }, userB: { select: person } } });
  if (!c || (c.userAId !== me && c.userBId !== me)) throw notFound('Conversation not found');
  return c;
}

// People I may start a conversation with.
r.get('/messages/contacts', async (req, res) => {
  const q = z.object({ search: z.string().trim().max(100).optional() }).parse(req.query);
  const where: Prisma.UserWhereInput = { AND: [await contacts(req), q.search ? {
    OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }],
  } : {}] };
  const rows = await prisma.user.findMany({ where, select: person, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 50 });
  res.json({ data: rows.map(card) });
});

r.get('/messages/unread', async (req, res) => {
  const me = req.user!.id;
  const convs = await prisma.conversation.findMany({ where: mineWhere(me), select: { id: true, userAId: true, aReadAt: true, bReadAt: true } });
  const counts = await unreadCounts(me, convs);
  res.json({ data: [...counts.values()].reduce((a, b) => a + b, 0) });
});

r.get('/conversations', async (req, res) => {
  const me = req.user!.id;
  const convs = await prisma.conversation.findMany({
    where: mineWhere(me), orderBy: { lastMessageAt: 'desc' }, take: 100,
    include: { userA: { select: person }, userB: { select: person }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderId: true, createdAt: true } } },
  });
  const counts = await unreadCounts(me, convs);
  res.json({ data: convs.map((c) => ({
    id: c.id, lastMessageAt: c.lastMessageAt, unread: counts.get(c.id) ?? 0,
    with: card(c.userAId === me ? c.userB : c.userA),
    last: c.messages[0] ? { body: c.messages[0].body.slice(0, 140), mine: c.messages[0].senderId === me, at: c.messages[0].createdAt } : null,
  })) });
});

// Opening a thread marks it read. `before` pages back through older messages.
r.get('/conversations/:id', async (req, res) => {
  const me = req.user!.id;
  const c = await myConversation(uuid.parse(req.params.id), me);
  const q = z.object({ before: z.coerce.date().optional() }).parse(req.query);
  const rows = await prisma.message.findMany({ where: { conversationId: c.id, createdAt: q.before ? { lt: q.before } : undefined }, orderBy: { createdAt: 'desc' }, take: 50 });
  if (!q.before) await prisma.conversation.update({ where: { id: c.id }, data: c.userAId === me ? { aReadAt: new Date() } : { bReadAt: new Date() } });
  const other = c.userAId === me ? c.userB : c.userA;
  const canReply = (await prisma.user.count({ where: { AND: [await contacts(req), { id: other.id }] } })) > 0;
  res.json({ data: {
    id: c.id, with: card(other), canReply, hasMore: rows.length === 50,
    otherReadAt: c.userAId === me ? c.bReadAt : c.aReadAt,
    messages: rows.reverse().map((m) => ({ id: m.id, body: m.body, mine: m.senderId === me, createdAt: m.createdAt })),
  } });
});

r.post('/messages', async (req, res) => {
  const me = req.user!.id;
  const b = z.object({ recipientId: uuid, body: z.string().trim().min(1, 'Type a message').max(4000) }).parse(req.body);
  // Authorisation: the recipient must be one of my contacts right now.
  if (!(await prisma.user.count({ where: { AND: [await contacts(req), { id: b.recipientId }] } }))) throw forbidden('You cannot message this person');
  // Anti-spam: 60 messages per 10 minutes.
  if ((await prisma.message.count({ where: { senderId: me, createdAt: { gte: new Date(Date.now() - 600_000) } } })) >= 60) {
    throw new AppError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a few minutes.');
  }

  const now = new Date();
  const key = pair(me, b.recipientId);
  const { conv, msg, wasCaughtUp } = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.upsert({ where: { userAId_userBId: key }, create: { ...key, lastMessageAt: now, createdAt: now }, update: { lastMessageAt: now } });
    // Did the recipient already have unread messages from me? Then they've been notified once already.
    const theirRead = conv.userAId === b.recipientId ? conv.aReadAt : conv.bReadAt;
    const pending = await tx.message.count({ where: { conversationId: conv.id, senderId: me, createdAt: { gt: theirRead ?? EPOCH } } });
    const msg = await tx.message.create({ data: { conversationId: conv.id, senderId: me, body: b.body, createdAt: now } });
    // Sending implies I've read the thread up to now.
    await tx.conversation.update({ where: { id: conv.id }, data: conv.userAId === me ? { aReadAt: now } : { bReadAt: now } });
    return { conv, msg, wasCaughtUp: pending === 0 };
  });

  // One notification per unread streak, not one per message.
  if (wasCaughtUp) await notify([b.recipientId], { type: 'MESSAGE', title: `New message from ${req.user!.firstName} ${req.user!.lastName}`, body: b.body.slice(0, 120), link: `/messages/${conv.id}` });
  if (conv.createdAt.getTime() === now.getTime()) await audit(req, 'CONVERSATION_STARTED', 'Conversation', conv.id, { with: b.recipientId });
  res.status(201).json({ data: { conversationId: conv.id, message: { id: msg.id, body: msg.body, mine: true, createdAt: msg.createdAt } } });
});

export default r;
