// Who may message whom — one rule set, used both to list contacts and to authorise every send.
//   College Admin ↔ anyone (faculty, students, parents, other admins)
//   Faculty       ↔ other faculty, students they teach, parents of those students
//   Student       ↔ their instructors, their linked parents
//   Parent        ↔ their linked children, their children's instructors
// Students never message other students. Relationships are checked live, so they end when an enrollment or parent link ends.
import type { Prisma, RoleName } from '@prisma/client';

const MESSAGING_ROLES: RoleName[] = ['COLLEGE_ADMIN', 'FACULTY', 'STUDENT', 'PARENT'];
export const canUseMessages = (roles: RoleName[]) => roles.some((r) => MESSAGING_ROLES.includes(r));

const role = (r: RoleName): Prisma.UserWhereInput => ({ roles: { some: { role: r } } });
const activeEnrollment = (offering: Prisma.CourseOfferingWhereInput): Prisma.EnrollmentWhereInput => ({ status: 'ACTIVE', offering });

/** Prisma filter for every user `me` may message. `parentPortal` = whether the parent portal feature is on. */
export function contactWhere(me: { id: string; roles: RoleName[] }, parentPortal: boolean): Prisma.UserWhereInput {
  const has = (r: RoleName) => me.roles.includes(r);
  const or: Prisma.UserWhereInput[] = [role('COLLEGE_ADMIN')]; // everyone can reach the college office

  if (has('COLLEGE_ADMIN')) or.push({ roles: { some: { role: { in: MESSAGING_ROLES } } } });

  if (has('FACULTY')) {
    const mine = activeEnrollment({ status: { not: 'ARCHIVED' }, instructors: { some: { facultyId: me.id } } });
    or.push(role('FACULTY'), { ...role('STUDENT'), enrollments: { some: mine } });
    if (parentPortal) or.push({ ...role('PARENT'), parentLinks: { some: { status: 'ACTIVE', student: { enrollments: { some: mine } } } } });
  }

  if (has('STUDENT')) {
    or.push({ ...role('FACULTY'), instructorOf: { some: { offering: { status: 'PUBLISHED', enrollments: { some: { studentId: me.id, status: 'ACTIVE' } } } } } });
    if (parentPortal) or.push({ ...role('PARENT'), parentLinks: { some: { studentId: me.id, status: 'ACTIVE' } } });
  }

  if (has('PARENT') && parentPortal) {
    const myChild: Prisma.UserWhereInput = { studentLinks: { some: { parentId: me.id, status: 'ACTIVE' } } };
    or.push(
      { ...role('STUDENT'), ...myChild },
      { ...role('FACULTY'), instructorOf: { some: { offering: { status: 'PUBLISHED', enrollments: { some: { status: 'ACTIVE', student: myChild } } } } } },
    );
  }

  return { id: { not: me.id }, status: 'ACTIVE', OR: or };
}

/** A pair is stored once, with the smaller id as user A. */
export const pair = (x: string, y: string) => (x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x });
