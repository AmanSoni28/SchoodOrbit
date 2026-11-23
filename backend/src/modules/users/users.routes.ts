import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, RoleName } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, hasRole, requireRole } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { paging, meta } from '../../lib/http';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { hashPassword } from '../auth/auth.service';
import { passwordSchema } from '../auth/auth.routes';

const r = Router();
r.use(['/users', '/parent-links'], requireRole('SUPER_ADMIN', 'COLLEGE_ADMIN'));

const ROLES = ['SUPER_ADMIN', 'COLLEGE_ADMIN', 'FACULTY', 'STUDENT', 'PARENT'] as const;
const select = { id: true, email: true, firstName: true, lastName: true, status: true, mfaEnabled: true, lastLoginAt: true, createdAt: true, roles: { select: { role: true } } };
const shape = (u: any) => ({ ...u, roles: u.roles.map((x: any) => x.role) });

// Only a Super Admin can grant or modify privileged roles.
function assertCanGrant(actorRoles: RoleName[], roles: readonly RoleName[]) {
  if (roles.some((x) => x === 'SUPER_ADMIN' || x === 'COLLEGE_ADMIN') && !actorRoles.includes('SUPER_ADMIN')) {
    throw forbidden('Only a Super Admin can grant administrator roles');
  }
}

r.get('/users', async (req, res) => {
  const p = paging(req.query);
  const q = z.object({ search: z.string().max(100).optional(), role: z.enum(ROLES).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }).parse(req.query);
  const where: Prisma.UserWhereInput = {
    status: q.status,
    roles: q.role ? { some: { role: q.role } } : undefined,
    OR: q.search ? ['email', 'firstName', 'lastName'].map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } })) : undefined,
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.user.count({ where }),
  ]);
  res.json({ data: rows.map(shape), meta: meta(p, total) });
});

r.post('/users', async (req, res) => {
  const body = z.object({
    email: z.string().email().max(200), firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80),
    password: passwordSchema, roles: z.array(z.enum(ROLES)).min(1),
  }).parse(req.body);
  assertCanGrant(req.user!.roles, body.roles);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase().trim(), firstName: body.firstName, lastName: body.lastName,
      passwordHash: await hashPassword(body.password), roles: { create: body.roles.map((role) => ({ role })) },
    },
    select,
  });
  await audit(req, 'USER_CREATED', 'User', user.id, { roles: body.roles });
  res.status(201).json({ data: shape(user) });
});

r.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: z.string().uuid().parse(req.params.id) }, select });
  if (!user) throw notFound('User not found');
  res.json({ data: shape(user) });
});

r.patch('/users/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({
    firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80), status: z.enum(['ACTIVE', 'SUSPENDED']),
    roles: z.array(z.enum(ROLES)).min(1), password: passwordSchema,
  }).partial().parse(req.body);
  const target = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
  if (!target) throw notFound('User not found');
  const targetRoles = target.roles.map((x) => x.role);
  assertCanGrant(req.user!.roles, targetRoles); // can't edit an admin unless super admin
  if (body.roles) assertCanGrant(req.user!.roles, body.roles);
  if (id === req.user!.id && (body.status === 'SUSPENDED' || (body.roles && !body.roles.includes('SUPER_ADMIN') && hasRole(req.user, 'SUPER_ADMIN')))) {
    throw badRequest('You cannot suspend yourself or remove your own Super Admin role');
  }
  const user = await prisma.$transaction(async (tx) => {
    if (body.roles) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: body.roles.map((role) => ({ userId: id, role })) });
    }
    if (body.status === 'SUSPENDED' || body.password) {
      await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return tx.user.update({
      where: { id },
      data: { firstName: body.firstName, lastName: body.lastName, status: body.status, passwordHash: body.password ? await hashPassword(body.password) : undefined },
      select,
    });
  });
  await audit(req, 'USER_UPDATED', 'User', id, { ...body, password: body.password ? '[changed]' : undefined });
  res.json({ data: shape(user) });
});

// ── Parent ↔ student links (verified by an administrator) ──
r.get('/parent-links', async (req, res) => {
  const links = await prisma.parentStudentLink.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      parent: { select: { id: true, email: true, firstName: true, lastName: true } },
      student: { select: { id: true, email: true, firstName: true, lastName: true } },
      consents: { where: { revokedAt: null } },
    },
  });
  res.json({ data: links });
});

r.post('/parent-links', async (req, res) => {
  const body = z.object({
    parentId: z.string().uuid(), studentId: z.string().uuid(), relationship: z.string().max(40).default('Guardian'),
    scope: z.array(z.enum(['PROGRESS', 'GRADES', 'ATTENDANCE'])).min(1), expiresAt: z.coerce.date().optional(),
  }).parse(req.body);
  const [parent, student] = await Promise.all([
    prisma.userRole.findUnique({ where: { userId_role: { userId: body.parentId, role: 'PARENT' } } }),
    prisma.userRole.findUnique({ where: { userId_role: { userId: body.studentId, role: 'STUDENT' } } }),
  ]);
  if (!parent || !student) throw badRequest('Choose a parent account and a student account');
  const link = await prisma.$transaction(async (tx) => {
    const l = await tx.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId: body.parentId, studentId: body.studentId } },
      create: { parentId: body.parentId, studentId: body.studentId, relationship: body.relationship, status: 'ACTIVE', verifiedAt: new Date(), verifiedById: req.user!.id },
      update: { status: 'ACTIVE', relationship: body.relationship, verifiedAt: new Date(), verifiedById: req.user!.id },
    });
    await tx.parentAccessConsent.updateMany({ where: { linkId: l.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.parentAccessConsent.create({ data: { linkId: l.id, scope: body.scope, grantedById: req.user!.id, expiresAt: body.expiresAt } });
    return l;
  });
  await audit(req, 'PARENT_LINK_VERIFIED', 'ParentStudentLink', link.id, { scope: body.scope });
  res.status(201).json({ data: link });
});

r.post('/parent-links/:id/revoke', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await prisma.$transaction([
    prisma.parentStudentLink.update({ where: { id }, data: { status: 'REVOKED' } }),
    prisma.parentAccessConsent.updateMany({ where: { linkId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(req, 'PARENT_LINK_REVOKED', 'ParentStudentLink', id);
  res.json({ data: { ok: true } });
});

export default r;
