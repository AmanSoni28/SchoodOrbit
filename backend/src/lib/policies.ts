// Resource-level authorization. Route-level role checks are not enough: every offering-scoped
// action re-checks instructor assignment / enrollment / parent consent in the database.
import type { Request } from 'express';
import { prisma } from './prisma';
import { forbidden, notFound } from './errors';
import { hasRole, type AuthUser } from '../middleware/auth';
import { audit } from './audit';

export async function offeringAccess(user: AuthUser, offeringId: string) {
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId }, select: { id: true, status: true } });
  if (!offering) throw notFound('Course offering not found');
  const [instr, enr] = await Promise.all([
    hasRole(user, 'FACULTY') ? prisma.instructorAssignment.findUnique({ where: { facultyId_offeringId: { facultyId: user.id, offeringId } } }) : null,
    hasRole(user, 'STUDENT') ? prisma.enrollment.findUnique({ where: { studentId_offeringId: { studentId: user.id, offeringId } } }) : null,
  ]);
  return {
    offering,
    isInstructor: !!instr,
    // Students only see published offerings they are actively enrolled in.
    isStudent: !!enr && enr.status !== 'DROPPED' && offering.status === 'PUBLISHED',
    isAdmin: hasRole(user, 'COLLEGE_ADMIN'),
  };
}

/** Assigned instructor only (write access to teaching content). */
export async function assertInstructor(user: AuthUser, offeringId: string) {
  const a = await offeringAccess(user, offeringId);
  if (!a.isInstructor) throw forbidden('You are not assigned to teach this course');
  return a;
}

/** Instructor or college admin (oversight/read of teaching data). */
export async function assertStaff(user: AuthUser, offeringId: string) {
  const a = await offeringAccess(user, offeringId);
  if (!a.isInstructor && !a.isAdmin) throw forbidden();
  return a;
}

/** Anyone legitimately inside the course: instructor, enrolled student, or college admin. */
export async function assertMember(user: AuthUser, offeringId: string) {
  const a = await offeringAccess(user, offeringId);
  if (!a.isInstructor && !a.isStudent && !a.isAdmin) throw forbidden('You are not enrolled in this course');
  return a;
}

export async function assertStudent(user: AuthUser, offeringId: string) {
  const a = await offeringAccess(user, offeringId);
  if (!a.isStudent) throw forbidden('You are not enrolled in this course');
  return a;
}

export type ParentScope = 'PROGRESS' | 'GRADES' | 'ATTENDANCE';

/** Parent read requires an ACTIVE link and a live consent covering the scope. Access is audited. */
export async function assertParentScope(req: Request, studentId: string, scope: ParentScope) {
  const link = await prisma.parentStudentLink.findUnique({
    where: { parentId_studentId: { parentId: req.user!.id, studentId } },
    include: { consents: { where: { revokedAt: null } } },
  });
  // 404 rather than 403: don't reveal whether an unlinked student exists.
  if (!link || link.status !== 'ACTIVE') throw notFound('Student not found');
  const now = new Date();
  const ok = link.consents.some((c) => c.scope.includes(scope) && (!c.expiresAt || c.expiresAt > now));
  if (!ok) throw forbidden(`Access to ${scope.toLowerCase()} has not been granted`);
  await audit(req, 'PARENT_VIEW', 'User', studentId, { scope });
  return link;
}
