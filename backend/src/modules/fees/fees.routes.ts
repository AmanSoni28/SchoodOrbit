import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hasRole, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { feeState, r2, type FeeStatus } from './fees.service';

const r = Router();
const uuid = z.string().uuid();
const admin = requireRole('COLLEGE_ADMIN');
const money = z.coerce.number().finite().nonnegative().max(1e9);
const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'] as const;

const studentSel = { select: { id: true, firstName: true, lastName: true, email: true } };
const withState = <T extends { amount: unknown; discount: unknown; dueDate: Date; payments: { amount: unknown }[] }>(f: T) => ({ ...f, ...feeState(f) });

// shortcut: aggregates load every fee row into memory — fine for one college (thousands of rows); move to SQL views if it grows past ~100k.
async function allFees() {
  const fees = await prisma.studentFee.findMany({ include: { payments: { select: { amount: true } }, structure: { select: { id: true, name: true } }, student: studentSel } });
  return fees.map(withState);
}

// ── Admin ──
r.get('/fees/overview', admin, async (_req, res) => {
  const fees = await allFees();
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 11, 1); since.setUTCHours(0, 0, 0, 0);
  const [monthly, methods, recent] = await Promise.all([
    prisma.$queryRaw<{ m: Date; total: number; n: number }[]>`
      SELECT date_trunc('month', "paidAt") AS m, SUM(amount)::float AS total, COUNT(*)::int AS n FROM "FeePayment" WHERE "paidAt" >= ${since} GROUP BY 1`,
    prisma.feePayment.groupBy({ by: ['method'], _sum: { amount: true }, _count: true }),
    prisma.feePayment.findMany({ orderBy: { paidAt: 'desc' }, take: 8, include: { studentFee: { select: { student: studentSel, structure: { select: { name: true } } } } } }),
  ]);
  const byMonth = new Map(monthly.map((x) => [x.m.toISOString().slice(0, 7), x]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(since); d.setUTCMonth(since.getUTCMonth() + i);
    const k = d.toISOString().slice(0, 7);
    return { month: k, total: r2(byMonth.get(k)?.total ?? 0), payments: byMonth.get(k)?.n ?? 0 };
  });
  const tot = (k: 'net' | 'paid' | 'balance', pred: (f: (typeof fees)[number]) => boolean = () => true) => r2(fees.filter(pred).reduce((s, f) => s + f[k], 0));
  const statusCounts = (['PAID', 'PARTIAL', 'PENDING', 'OVERDUE', 'WAIVED'] as FeeStatus[]).map((s) => ({ status: s, n: fees.filter((f) => f.status === s).length }));
  const structures = [...new Map(fees.map((f) => [f.structure.id, f.structure.name])).entries()].map(([id, name]) => ({
    id, name, billed: tot('net', (f) => f.structure.id === id), collected: tot('paid', (f) => f.structure.id === id), students: fees.filter((f) => f.structure.id === id).length,
  }));
  const owing = new Map<string, { student: (typeof fees)[number]['student']; balance: number; overdue: number }>();
  for (const f of fees.filter((x) => x.balance > 0)) {
    const o = owing.get(f.studentId) ?? { student: f.student, balance: 0, overdue: 0 };
    o.balance = r2(o.balance + f.balance); if (f.status === 'OVERDUE') o.overdue = r2(o.overdue + f.balance);
    owing.set(f.studentId, o);
  }
  res.json({
    data: {
      totals: { billed: tot('net'), collected: tot('paid'), outstanding: tot('balance'), overdue: tot('balance', (f) => f.status === 'OVERDUE'), discounts: r2(fees.reduce((s, f) => s + Number(f.discount), 0)), students: new Set(fees.map((f) => f.studentId)).size, charges: fees.length },
      statusCounts, months, structures,
      methods: methods.map((m) => ({ method: m.method, total: r2(Number(m._sum.amount ?? 0)), n: m._count })),
      defaulters: [...owing.values()].filter((o) => o.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 8),
      recent: recent.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, receiptNo: p.receiptNo, paidAt: p.paidAt, student: p.studentFee.student, fee: p.studentFee.structure.name })),
    },
  });
});

r.get('/fees/structures', admin, async (_req, res) => {
  const [structs, fees] = await Promise.all([
    prisma.feeStructure.findMany({ orderBy: { dueDate: 'desc' }, include: { semester: { select: { name: true, academicYear: { select: { label: true } } } } } }),
    allFees(),
  ]);
  res.json({
    data: structs.map((s) => {
      const mine = fees.filter((f) => f.structureId === s.id);
      return { ...s, amount: Number(s.amount), assigned: mine.length, billed: r2(mine.reduce((a, f) => a + f.net, 0)), collected: r2(mine.reduce((a, f) => a + f.paid, 0)), paidCount: mine.filter((f) => f.status === 'PAID' || f.status === 'WAIVED').length };
    }),
  });
});

const structureBody = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional().nullable(), amount: money.positive(), dueDate: z.coerce.date(), semesterId: uuid.optional().nullable() });
r.post('/fees/structures', admin, async (req, res) => {
  const b = structureBody.parse(req.body);
  const s = await prisma.feeStructure.create({ data: { ...b, description: b.description || null, semesterId: b.semesterId || null } });
  await audit(req, 'FEE_STRUCTURE_CREATED', 'FeeStructure', s.id, { name: s.name, amount: b.amount });
  res.status(201).json({ data: s });
});

const assignBody = z.object({ target: z.enum(['ALL', 'SEMESTER', 'PROGRAM']), semesterId: uuid.optional(), programId: uuid.optional(), discount: money.default(0) });
r.post('/fees/structures/:id/assign', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = assignBody.parse(req.body);
  const s = await prisma.feeStructure.findUnique({ where: { id } });
  if (!s) throw notFound('Fee structure not found');
  if (b.discount > Number(s.amount)) throw badRequest('Discount cannot exceed the fee amount');
  const activeStudent = { status: 'ACTIVE' as const, roles: { some: { role: 'STUDENT' as const } } };
  let where;
  if (b.target === 'ALL') where = activeStudent;
  else if (b.target === 'SEMESTER') {
    if (!b.semesterId) throw badRequest('Choose a semester');
    where = { ...activeStudent, enrollments: { some: { status: { not: 'DROPPED' as const }, offering: { semesterId: b.semesterId } } } };
  } else {
    if (!b.programId) throw badRequest('Choose a program');
    where = { ...activeStudent, enrollments: { some: { status: { not: 'DROPPED' as const }, offering: { section: { batch: { programId: b.programId } } } } } };
  }
  const students = await prisma.user.findMany({ where, select: { id: true } });
  const created = await prisma.studentFee.createMany({ data: students.map((u) => ({ structureId: id, studentId: u.id, amount: s.amount, discount: b.discount, dueDate: s.dueDate })), skipDuplicates: true });
  await audit(req, 'FEE_ASSIGNED', 'FeeStructure', id, { target: b.target, matched: students.length, created: created.count });
  res.json({ data: { matched: students.length, created: created.count } });
});

r.get('/fees/ledger', admin, async (req, res) => {
  const q = z.object({ search: z.string().trim().optional(), status: z.enum(['PAID', 'PARTIAL', 'PENDING', 'OVERDUE', 'WAIVED']).optional(), structureId: uuid.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const fees = await prisma.studentFee.findMany({
    where: {
      structureId: q.structureId,
      ...(q.search ? { student: { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } : {}),
    },
    include: { student: studentSel, structure: { select: { id: true, name: true } }, payments: { orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, method: true, receiptNo: true, paidAt: true, reference: true } } },
    orderBy: [{ dueDate: 'asc' }, { student: { lastName: 'asc' } }],
  });
  const rows = fees.map(withState).filter((f) => !q.status || f.status === q.status);
  res.json({
    data: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((f) => ({ ...f, amount: Number(f.amount), discount: Number(f.discount), payments: f.payments.map((p) => ({ ...p, amount: Number(p.amount) })) })),
    meta: { page: q.page, pageSize: q.pageSize, total: rows.length },
  });
});

const paymentBody = z.object({ amount: money.positive(), method: z.enum(METHODS), reference: z.string().trim().max(120).optional().nullable(), note: z.string().trim().max(500).optional().nullable(), paidAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86400000, 'Payment date cannot be in the future').optional() });
r.post('/fees/student-fees/:id/payments', admin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = paymentBody.parse(req.body);
  const payment = await prisma.$transaction(async (tx) => {
    // Lock the charge so two concurrent payments can't both pass the balance check.
    await tx.$queryRaw`SELECT id FROM "StudentFee" WHERE id = ${id}::uuid FOR UPDATE`;
    const fee = await tx.studentFee.findUnique({ where: { id }, include: { payments: { select: { amount: true } } } });
    if (!fee) throw notFound('Fee not found');
    const { balance } = feeState(fee);
    if (r2(b.amount) > balance) throw badRequest(`Amount exceeds the outstanding balance of ${balance.toFixed(2)}`);
    const receiptNo = `RCT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    return tx.feePayment.create({ data: { studentFeeId: id, amount: r2(b.amount), method: b.method, reference: b.reference || null, note: b.note || null, paidAt: b.paidAt ?? new Date(), receiptNo, recordedById: req.user!.id } });
  });
  await audit(req, 'FEE_PAYMENT_RECORDED', 'StudentFee', id, { amount: b.amount, method: b.method, receiptNo: payment.receiptNo });
  res.status(201).json({ data: { ...payment, amount: Number(payment.amount) } });
});

// ── Receipt: admin, the student who paid, or a parent actively linked to them ──
r.get('/fees/payments/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const p = await prisma.feePayment.findUnique({
    where: { id },
    include: { recordedBy: { select: { firstName: true, lastName: true } }, studentFee: { include: { student: studentSel, structure: { select: { name: true } }, payments: { select: { amount: true } } } } },
  });
  // 404 (not 403) so receipt ids can't be probed.
  const allowed = p && (hasRole(req.user, 'COLLEGE_ADMIN') || p.studentFee.studentId === req.user!.id
    || (hasRole(req.user, 'PARENT') && await prisma.parentStudentLink.count({ where: { parentId: req.user!.id, studentId: p.studentFee.studentId, status: 'ACTIVE' } })));
  if (!p || !allowed) throw notFound('Receipt not found');
  const st = feeState(p.studentFee);
  res.json({ data: { id: p.id, receiptNo: p.receiptNo, amount: Number(p.amount), method: p.method, reference: p.reference, note: p.note, paidAt: p.paidAt, recordedBy: p.recordedBy, student: p.studentFee.student, fee: { name: p.studentFee.structure.name, net: st.net, paid: st.paid, balance: st.balance, status: st.status } } });
});

// ── Student (and linked parents, via parent.routes) ──
/** A student's charges, payments and totals. Shared by the student's own page and the parent portal. */
export async function studentFees(studentId: string) {
  const fees = await prisma.studentFee.findMany({
    where: { studentId },
    include: { structure: { select: { name: true, description: true } }, payments: { orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, method: true, receiptNo: true, paidAt: true, reference: true } } },
    orderBy: { dueDate: 'asc' },
  });
  const rows = fees.map(withState).map((f) => ({ ...f, amount: Number(f.amount), discount: Number(f.discount), payments: f.payments.map((p) => ({ ...p, amount: Number(p.amount) })) }));
  const nextDue = rows.filter((f) => f.balance > 0).sort((a, b) => +a.dueDate - +b.dueDate)[0] ?? null;
  return { fees: rows, totals: { billed: r2(rows.reduce((s, f) => s + f.net, 0)), paid: r2(rows.reduce((s, f) => s + f.paid, 0)), balance: r2(rows.reduce((s, f) => s + f.balance, 0)), overdue: r2(rows.filter((f) => f.status === 'OVERDUE').reduce((s, f) => s + f.balance, 0)) }, nextDue };
}

r.get('/fees/me', requireRole('STUDENT'), async (req, res) => {
  res.json({ data: await studentFees(req.user!.id) });
});

export default r;
