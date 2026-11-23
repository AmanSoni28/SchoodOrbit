import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { assertStaff, assertStudent } from '../../lib/policies';
import { audit } from '../../lib/audit';
import { computeGradebook } from './gradebook.service';

const r = Router();
const uuid = z.string().uuid();

async function staffBook(offeringId: string) {
  const enr = await prisma.enrollment.findMany({ where: { offeringId, status: { not: 'DROPPED' } }, include: { student: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { student: { lastName: 'asc' } } });
  const book = await computeGradebook(offeringId, enr.map((e) => e.studentId), false);
  return { ...book, rows: book.rows.map((row) => ({ ...row, student: enr.find((e) => e.studentId === row.studentId)!.student })) };
}

r.get('/offerings/:id/gradebook', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertStaff(req.user!, id);
  res.json({ data: await staffBook(id) });
});

// CSV export; cells are prefixed to neutralise spreadsheet formula injection.
r.get('/offerings/:id/gradebook.csv', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertStaff(req.user!, id);
  const b = await staffBook(id);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['Student', 'Email', ...b.columns.map((c) => c.title), 'Assignments %', 'Quizzes %', 'Total %'];
  const lines = b.rows.map((r) => [
    `${r.student.firstName} ${r.student.lastName}`, r.student.email,
    ...b.columns.map((c) => (r.cells[c.id] ? `${r.cells[c.id]!.earned}/${r.cells[c.id]!.max}` : '')),
    r.assignmentsPct, r.quizzesPct, r.totalPct,
  ]);
  await audit(req, 'GRADEBOOK_EXPORTED', 'CourseOffering', id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gradebook-${id}.csv"`);
  res.send([header, ...lines].map((l) => l.map(esc).join(',')).join('\r\n'));
});

r.get('/offerings/:id/grades/me', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await assertStudent(req.user!, id);
  const b = await computeGradebook(id, [req.user!.id], true);
  res.json({ data: { weights: b.weights, columns: b.columns, ...b.rows[0] } });
});

export default r;
