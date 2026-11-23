// Rich fictional demo data layered on top of `prisma/seed.ts` so every dashboard, chart and table has something to show.
// Run after the base seed: `npm run db:demo`. Idempotent (skips if already applied). Never deletes data. Refuses to run in production.
// All people, emails (.test TLD), amounts and records are invented. Seeded PRNG → the same data on every machine.
import crypto from 'node:crypto';
import { PrismaClient, type PaymentMethod, type RoleName } from '@prisma/client';
import argon2 from 'argon2';
import 'dotenv/config';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'Demo@Pass2026';
const DOMAIN = 'northbridge.test';
const DAY = 86400000;
const NOW = Date.now();
const MARKER = 'Semester 3 Tuition';

// ── deterministic randomness ──
let seed = 20261123;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const r2 = (n: number) => Math.round(n * 100) / 100;
const ago = (days: number, hour = int(9, 17)) => { const d = new Date(NOW - days * DAY); d.setHours(hour, int(0, 59), 0, 0); return d; };
const at = (iso: string, hour = 11) => { const d = new Date(`${iso}T00:00:00`); d.setHours(hour, int(0, 59)); return d; };
const past = (d: Date) => (d.getTime() > NOW - 3600000 ? new Date(NOW - int(1, 48) * 3600000) : d);
const chunked = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>, n = 500) => { for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n)); };

const FIRST = ['Aditya', 'Ananya', 'Arjun', 'Avni', 'Dev', 'Kavya', 'Krish', 'Meher', 'Neel', 'Nisha', 'Om', 'Pari', 'Pranav', 'Riya', 'Sahil', 'Sanya', 'Tanvi', 'Vihaan', 'Yash', 'Zoya', 'Aryan', 'Ira', 'Kunal', 'Myra', 'Parth', 'Rhea', 'Shaurya', 'Tara', 'Veer', 'Anika'];
const LAST = ['Agarwal', 'Bose', 'Chopra', 'Das', 'Fernandes', 'Ghosh', 'Hegde', 'Joshi', 'Kapoor', 'Kulkarni', 'Mehta', 'Mishra', 'Pillai', 'Rao', 'Reddy', 'Saxena', 'Sen', 'Sinha', 'Thomas', 'Yadav'];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to load demo data in production');
  const admin = await prisma.user.findUnique({ where: { email: `admin@${DOMAIN}` } });
  if (!admin) throw new Error('Base demo data not found — run `npm run db:seed` first.');
  if (await prisma.feeStructure.findFirst({ where: { name: MARKER } })) { console.log('Demo data already loaded — nothing to do.'); return; }

  const byEmail = (e: string) => prisma.user.findUniqueOrThrow({ where: { email: `${e}@${DOMAIN}` } });
  const [fac1, fac2] = await Promise.all([byEmail('faculty'), byEmail('faculty2')]);
  const baseStudents = await Promise.all(['student', 'student2', 'student3', 'student4', 'student5', 'student6'].map(byEmail));
  const sem3 = await prisma.semester.findFirstOrThrow({ where: { name: 'Semester 3' } });
  const sectionA = await prisma.section.findFirstOrThrow({ where: { name: 'A', batch: { program: { code: 'BTECH-CSE' } } } });
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: 'CSE' } });
  const ece = await prisma.department.findUniqueOrThrow({ where: { code: 'ECE' } });
  const cs301 = await prisma.courseOffering.findFirstOrThrow({ where: { semesterId: sem3.id, course: { code: 'CS301' } } });

  console.log('Creating people…');
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const mk = (email: string, firstName: string, lastName: string, roles: RoleName[], createdAt = new Date()) =>
    prisma.user.create({ data: { email: `${email}@${DOMAIN}`, firstName, lastName, passwordHash, createdAt, lastLoginAt: ago(int(0, 6)), roles: { create: roles.map((role) => ({ role })) } } });
  const fac3 = await mk('faculty3', 'Priya', 'Kulkarni', ['FACULTY'], ago(60));
  const fac4 = await mk('faculty4', 'Arjun', 'Reddy', ['FACULTY'], ago(55));
  const newStudents = [];
  for (let i = 0; i < 30; i++) newStudents.push(await mk(`student${i + 7}`, FIRST[i], LAST[(i * 7) % LAST.length], ['STUDENT'], ago(int(1, 40))));
  const cseStudents = [...baseStudents, ...newStudents.slice(0, 18)];
  const eceStudents = newStudents.slice(18);
  const allStudents = [...cseStudents, ...eceStudents];
  const parent2 = await mk('parent2', 'Kavita', 'Patel', ['PARENT'], ago(20));
  const link2 = await prisma.parentStudentLink.create({ data: { parentId: parent2.id, studentId: baseStudents[1].id, relationship: 'Mother', status: 'ACTIVE', verifiedAt: ago(19), verifiedById: admin.id } });
  await prisma.parentAccessConsent.create({ data: { linkId: link2.id, scope: ['PROGRESS', 'GRADES', 'ATTENDANCE'], grantedById: admin.id } });

  // Ability drives marks; engagement drives attendance and activity. Aarav (the demo student) is strong; one student struggles.
  const ability = new Map(allStudents.map((s) => [s.id, clamp(0.45 + rnd() * 0.5, 0, 1)]));
  const engage = new Map(allStudents.map((s) => [s.id, clamp(0.45 + rnd() * 0.5, 0, 1)]));
  ability.set(baseStudents[0].id, 0.9); engage.set(baseStudents[0].id, 0.92);
  ability.set(newStudents[5].id, 0.3); engage.set(newStudents[5].id, 0.35);
  const score = (sid: string, spread = 0.22) => clamp((ability.get(sid) ?? 0.6) + (rnd() - 0.5) * spread, 0.05, 1);

  console.log('Creating academic structure…');
  const ecePro = await prisma.program.create({ data: { departmentId: ece.id, code: 'BTECH-ECE', name: 'B.Tech Electronics & Communication', durationSemesters: 8 } });
  const eceBatch = await prisma.batch.create({ data: { programId: ecePro.id, name: '2025-2029' } });
  const eceSection = await prisma.section.create({ data: { batchId: eceBatch.id, name: 'A' } });
  const ay0 = await prisma.academicYear.create({ data: { label: '2025-26', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30') } });
  const sem1 = await prisma.semester.create({ data: { academicYearId: ay0.id, name: 'Semester 1', startDate: new Date('2025-07-15'), endDate: new Date('2025-12-20') } });
  const sem2 = await prisma.semester.create({ data: { academicYearId: ay0.id, name: 'Semester 2', startDate: new Date('2026-01-05'), endDate: new Date('2026-05-30') } });

  const course = (dept: string, code: string, title: string, credits: number, description: string) => prisma.course.create({ data: { departmentId: dept, code, title, credits, description } });
  const offering = (courseId: string, semesterId: string, sectionId: string, status: 'PUBLISHED' | 'ARCHIVED', faculty: string) =>
    prisma.courseOffering.create({ data: { courseId, semesterId, sectionId, status, aiPolicy: { create: {} }, revisionPolicy: { create: {} }, instructors: { create: { facultyId: faculty } } } });

  type Off = { id: string; title: string; faculty: string; students: typeof allStudents; past: boolean; start: Date; end: Date };
  const offs: Off[] = [];
  const add = async (dept: string, code: string, title: string, credits: number, desc: string, sem: { id: string; startDate: Date; endDate: Date }, section: string, status: 'PUBLISHED' | 'ARCHIVED', faculty: string, students: typeof allStudents) => {
    const c = await course(dept, code, title, credits, desc);
    const o = await offering(c.id, sem.id, section, status, faculty);
    await prisma.enrollment.createMany({ data: students.map((s) => ({ studentId: s.id, offeringId: o.id, enrolledAt: sem.startDate })) });
    offs.push({ id: o.id, title, faculty, students, past: status === 'ARCHIVED', start: sem.startDate, end: sem.endDate });
  };
  // Current semester
  await add(cse.id, 'CS303', 'Operating Systems', 4, 'Processes, threads, scheduling, memory management and file systems.', sem3, sectionA.id, 'PUBLISHED', fac3.id, cseStudents);
  await add(cse.id, 'CS304', 'Computer Networks', 3, 'Layered architecture, TCP/IP, routing, congestion control and sockets.', sem3, sectionA.id, 'PUBLISHED', fac2.id, cseStudents);
  await add(ece.id, 'EC301', 'Signals & Systems', 4, 'Continuous and discrete signals, LTI systems, Fourier and Laplace transforms.', sem3, eceSection.id, 'PUBLISHED', fac4.id, eceStudents);
  await add(ece.id, 'EC302', 'Digital Electronics', 4, 'Boolean algebra, combinational and sequential circuits, FSMs.', sem3, eceSection.id, 'PUBLISHED', fac4.id, eceStudents);
  await add(ece.id, 'EC303', 'Microprocessors', 3, '8085/8086 architecture, assembly programming and interfacing.', sem3, eceSection.id, 'PUBLISHED', fac3.id, eceStudents);
  // Past semesters (closed, results published) — CSE cohort
  await add(cse.id, 'CS101', 'Programming in C', 4, 'Problem solving, control flow, functions, pointers and files in C.', sem1, sectionA.id, 'ARCHIVED', fac1.id, cseStudents);
  await add(cse.id, 'MA101', 'Engineering Mathematics I', 4, 'Calculus, sequences and series, matrices.', sem1, sectionA.id, 'ARCHIVED', fac2.id, cseStudents);
  await add(cse.id, 'PH101', 'Engineering Physics', 3, 'Optics, quantum mechanics basics and semiconductors.', sem1, sectionA.id, 'ARCHIVED', fac3.id, cseStudents);
  await add(cse.id, 'CS201', 'Object Oriented Programming', 4, 'Classes, inheritance, polymorphism and design in Java.', sem2, sectionA.id, 'ARCHIVED', fac1.id, cseStudents);
  await add(cse.id, 'MA201', 'Engineering Mathematics II', 4, 'Differential equations, vector calculus, transforms.', sem2, sectionA.id, 'ARCHIVED', fac2.id, cseStudents);
  await add(cse.id, 'CS202', 'Discrete Mathematics', 3, 'Logic, sets, relations, graphs and combinatorics.', sem2, sectionA.id, 'ARCHIVED', fac3.id, cseStudents);
  // The existing CS301 gets the new CSE students too.
  await prisma.enrollment.createMany({ data: newStudents.slice(0, 18).map((s) => ({ studentId: s.id, offeringId: cs301.id, enrolledAt: sem3.startDate })), skipDuplicates: true });

  console.log('Creating lessons, assignments, quizzes and grades…');
  const lessonIds = new Map<string, string[]>();
  for (const o of offs.filter((x) => !x.past)) {
    const ids: string[] = [];
    for (const [mi, unit] of ['Unit 1 — Foundations', 'Unit 2 — Core concepts', 'Unit 3 — Applications'].entries()) {
      const m = await prisma.courseModule.create({ data: { offeringId: o.id, title: unit, position: mi } });
      for (let li = 0; li < 2; li++) {
        const l = await prisma.lesson.create({ data: { moduleId: m.id, offeringId: o.id, title: `${o.title}: ${['Introduction', 'Key ideas', 'Worked examples', 'Deep dive', 'Case study', 'Revision'][mi * 2 + li]}`, position: li, status: mi === 2 && li === 1 ? 'DRAFT' : 'PUBLISHED', content: `Lesson notes for ${o.title}. Read through the examples and attempt the practice questions at the end.` } });
        if (!(mi === 2 && li === 1)) ids.push(l.id);
      }
    }
    lessonIds.set(o.id, ids);
    const progress = o.students.flatMap((s) => ids.slice(0, Math.round(ids.length * clamp((engage.get(s.id) ?? 0.6) + (rnd() - 0.4) * 0.4, 0, 1))).map((lessonId, k) => ({ lessonId, studentId: s.id, completedAt: ago(Math.max(1, 70 - k * 12 + int(0, 5))) })));
    await prisma.lessonProgress.createMany({ data: progress, skipDuplicates: true });
  }
  // CS301 progress for new students on its published lessons
  const cs301Lessons = (await prisma.lesson.findMany({ where: { offeringId: cs301.id, status: 'PUBLISHED' }, select: { id: true } })).map((l) => l.id);
  await prisma.lessonProgress.createMany({ data: newStudents.slice(0, 18).flatMap((s) => cs301Lessons.slice(0, int(0, cs301Lessons.length)).map((lessonId) => ({ lessonId, studentId: s.id, completedAt: ago(int(3, 40)) }))), skipDuplicates: true });

  const gradeAssignments = async (o: Off, items: { title: string; due: Date; max: number; open?: boolean }[]) => {
    for (const it of items) {
      const a = await prisma.assignment.create({ data: { offeringId: o.id, title: it.title, instructions: `Complete "${it.title}" and upload your work as a PDF.`, dueAt: it.due, maxPoints: it.max, status: o.past ? 'CLOSED' : 'PUBLISHED', allowLate: true, latePenaltyPct: 10, createdAt: new Date(it.due.getTime() - 14 * DAY) } });
      if (it.open) {
        // Upcoming: a few early submissions, ungraded
        await prisma.submission.createMany({ data: o.students.filter(() => chance(0.25)).map((s) => ({ assignmentId: a.id, studentId: s.id, content: 'Submitted early.', submittedAt: past(new Date(NOW - int(1, 3) * DAY)) })) });
        continue;
      }
      const rows = o.students.filter((s) => chance(0.55 + (engage.get(s.id) ?? 0.6) * 0.45)).map((s) => {
        const late = chance(0.12);
        const graded = o.past || chance(0.85);
        return {
          assignmentId: a.id, studentId: s.id, content: 'See attached solution.', isLate: late,
          submittedAt: new Date(it.due.getTime() + (late ? int(1, 3) * DAY : -int(1, 72) * 3600000)),
          status: graded ? ('GRADED' as const) : ('SUBMITTED' as const), score: graded ? Math.round(score(s.id) * it.max) : null,
          feedback: graded ? pick(['Well structured answer.', 'Good attempt — revisit the edge cases.', 'Clear reasoning, minor errors in the final step.', 'Needs more detail in the explanation.']) : null,
          gradedById: graded ? o.faculty : null, gradedAt: graded ? new Date(it.due.getTime() + 4 * DAY) : null,
          gradePublishedAt: graded && (o.past || chance(0.9)) ? past(new Date(it.due.getTime() + 5 * DAY)) : null,
        };
      });
      await prisma.submission.createMany({ data: rows });
    }
  };
  const addQuiz = async (o: Off, title: string, closes: Date, prompts: [string, string[], number][]) => {
    const versions: { id: string }[] = [];
    for (const [prompt, opts, correct] of prompts) {
      const q = await prisma.question.create({ data: { offeringId: o.id, createdById: o.faculty, type: 'MCQ', status: 'APPROVED', versions: { create: { version: 1, prompt, options: opts.map((text, i) => ({ id: 'abcd'[i], text })), correctAnswer: 'abcd'[correct], points: [3, 3, 4][versions.length], explanation: `The correct answer is “${opts[correct]}”.` } } }, include: { versions: true } });
      versions.push(q.versions[0]);
    }
    const quiz = await prisma.quiz.create({ data: { offeringId: o.id, title, status: o.past ? 'CLOSED' : 'PUBLISHED', timeLimitMinutes: 15, maxAttempts: 1, closesAt: closes, resultsPublished: true, createdAt: new Date(closes.getTime() - 10 * DAY), questions: { create: versions.map((v, position) => ({ questionVersionId: v.id, position })) } } });
    if (closes.getTime() > NOW) return;
    await prisma.quizAttempt.createMany({
      data: o.students.filter(() => chance(0.88)).map((s) => {
        const sub = new Date(closes.getTime() - int(1, 96) * 3600000);
        return { quizId: quiz.id, studentId: s.id, attemptNo: 1, status: 'GRADED' as const, startedAt: new Date(sub.getTime() - 12 * 60000), submittedAt: sub, score: Math.round(score(s.id, 0.3) * 10), maxScore: 10 };
      }),
    });
  };
  const mcq = (topic: string): [string, string[], number][] => [[`Which statement about ${topic} is correct?`, ['The first definition', 'The second definition', 'Neither', 'Both'], 1], [`Pick the best example of ${topic}.`, ['Example A', 'Example B', 'Example C', 'Example D'], 2], [`What is the main goal of ${topic}?`, ['Speed', 'Correctness', 'Cost', 'Portability'], 1]];
  for (const o of offs) {
    if (o.past) {
      const mid = new Date((o.start.getTime() + o.end.getTime()) / 2);
      await gradeAssignments(o, [{ title: 'Assignment 1', due: new Date(o.start.getTime() + 35 * DAY), max: 20 }, { title: 'Assignment 2', due: new Date(o.end.getTime() - 30 * DAY), max: 20 }, { title: 'Mini project', due: new Date(o.end.getTime() - 10 * DAY), max: 50 }]);
      await addQuiz(o, 'Mid-term quiz', mid, mcq(o.title));
      await addQuiz(o, 'End-term quiz', new Date(o.end.getTime() - 5 * DAY), mcq(`${o.title} (advanced)`));
    } else {
      await gradeAssignments(o, [{ title: 'Problem set 1', due: ago(55), max: 20 }, { title: 'Problem set 2', due: ago(25), max: 20 }, { title: 'Lab report', due: ago(6), max: 30 }, { title: 'Course project', due: new Date(NOW + 9 * DAY), max: 50, open: true }]);
      await addQuiz(o, 'Quiz 1', ago(40), mcq(o.title));
      await addQuiz(o, 'Quiz 2', ago(12), mcq(`${o.title} (part 2)`));
      await addQuiz(o, 'Quiz 3', new Date(NOW + 5 * DAY), mcq(`${o.title} (part 3)`));
    }
  }
  // CS301 extras: graded quiz attempts + published submissions for the new students
  const cs301Quiz = await prisma.quiz.findFirstOrThrow({ where: { offeringId: cs301.id } });
  await prisma.quizAttempt.createMany({ data: newStudents.slice(0, 18).filter(() => chance(0.85)).map((s) => ({ quizId: cs301Quiz.id, studentId: s.id, attemptNo: 1, status: 'GRADED' as const, startedAt: ago(4), submittedAt: ago(4), score: Math.round(score(s.id) * 5), maxScore: 5 })) });
  const cs301A2 = await prisma.assignment.findFirstOrThrow({ where: { offeringId: cs301.id, title: 'Normalize the Orders Table' } });
  await prisma.submission.createMany({ data: newStudents.slice(0, 18).filter(() => chance(0.8)).map((s) => ({ assignmentId: cs301A2.id, studentId: s.id, content: 'Decomposed into Orders, Customers and Items.', submittedAt: ago(3), status: 'GRADED' as const, score: Math.round(score(s.id) * 10), gradedById: fac1.id, gradedAt: ago(1), gradePublishedAt: ago(1) })) });
  const cs301Extra = await prisma.assignment.create({ data: { offeringId: cs301.id, title: 'SQL Practice Set', instructions: 'Write queries for the 10 questions in the attached sheet.', dueAt: ago(20), maxPoints: 25, status: 'PUBLISHED', createdAt: ago(34) } });
  await prisma.submission.createMany({ data: cseStudents.filter(() => chance(0.9)).map((s) => ({ assignmentId: cs301Extra.id, studentId: s.id, content: 'Queries attached.', submittedAt: ago(21), status: 'GRADED' as const, score: Math.round(score(s.id) * 25), gradedById: fac1.id, gradedAt: ago(16), gradePublishedAt: ago(15) })) });

  console.log('Creating class sessions and attendance…');
  const sessionsFor = async (o: { id: string; title: string; students: typeof allStudents }, count: number, markBy: string) => {
    for (let w = count; w >= 1; w--) {
      const start = ago(w * 7 - int(0, 2), 10);
      const s = await prisma.classSession.create({ data: { offeringId: o.id, title: `${o.title} — Lecture ${count - w + 1}`, startsAt: start, endsAt: new Date(start.getTime() + 3600000) } });
      await prisma.attendanceRecord.createMany({
        data: o.students.map((st) => {
          const e = engage.get(st.id) ?? 0.7, x = rnd();
          return { sessionId: s.id, studentId: st.id, markedById: markBy, status: x < 0.55 + e * 0.4 ? 'PRESENT' as const : x < 0.6 + e * 0.4 ? 'LATE' as const : x < 0.63 + e * 0.4 ? 'EXCUSED' as const : 'ABSENT' as const }; // ~75–93% present
        }),
      });
    }
    for (const d of [2, 6]) {
      const start = new Date(NOW + d * DAY); start.setHours(10, 0, 0, 0);
      await prisma.classSession.create({ data: { offeringId: o.id, title: `${o.title} — Upcoming lecture`, startsAt: start, endsAt: new Date(start.getTime() + 3600000), meetingUrl: `https://meet.example.com/${o.id.slice(0, 8)}` } });
    }
  };
  for (const o of offs.filter((x) => !x.past)) await sessionsFor(o, 10, o.faculty);
  await sessionsFor({ id: cs301.id, title: 'Database Management Systems', students: cseStudents }, 9, fac1.id);

  console.log('Creating learning activity…');
  const events: { userId: string; offeringId: string; resourceType: string; resourceId: string | null; type: string; occurredAt: Date }[] = [];
  const current = [...offs.filter((x) => !x.past), { id: cs301.id, students: cseStudents } as Off];
  for (const o of current) {
    const lessons = lessonIds.get(o.id) ?? cs301Lessons;
    for (const s of o.students) {
      const e = engage.get(s.id) ?? 0.6;
      for (let d = 83; d >= 0; d--) {
        const weekday = new Date(NOW - d * DAY).getDay();
        if (!chance((weekday === 0 || weekday === 6 ? 0.12 : 0.3) * e * 1.3)) continue;
        for (let k = int(1, 3); k > 0; k--) {
          const kind = pick(['LESSON', 'LESSON', 'LESSON', 'QUIZ', 'ASSIGNMENT'] as const);
          events.push({ userId: s.id, offeringId: o.id, resourceType: kind, resourceId: kind === 'LESSON' ? pick(lessons) ?? null : null, type: kind === 'LESSON' ? pick(['VIEWED', 'VIEWED', 'COMPLETED']) : kind === 'QUIZ' ? 'ATTEMPTED' : 'SUBMITTED', occurredAt: past(ago(d)) });
        }
      }
    }
  }
  await chunked(events, (c) => prisma.learningEvent.createMany({ data: c }));

  console.log('Creating doubts, announcements and notifications…');
  const doubtSeeds = [
    ['What is the difference between a process and a thread?', 'OPEN'], ['Why does round-robin scheduling need a time quantum?', 'ANSWERED'], ['How does TCP handle packet loss?', 'RESOLVED'],
    ['Is the Fourier transform of a periodic signal always discrete?', 'ANSWERED'], ['How do I minimise a 5-variable K-map?', 'OPEN'], ['What does the ALE pin do on the 8085?', 'OPEN'],
    ['When should I use a semaphore instead of a mutex?', 'RESOLVED'], ['Why is the subnet mask needed?', 'ANSWERED'], ['Can a Moore machine have fewer states than a Mealy machine?', 'OPEN'],
  ] as const;
  for (const [i, [title, status]] of doubtSeeds.entries()) {
    const o = offs.filter((x) => !x.past)[i % 5];
    const d = await prisma.doubt.create({ data: { offeringId: o.id, authorId: pick(o.students).id, title, body: 'I read the lesson notes but I am still unsure — could someone explain with an example?', status, voteCount: int(0, 9), createdAt: ago(int(1, 30)) } });
    if (status !== 'OPEN') await prisma.doubtReply.create({ data: { doubtId: d.id, authorId: o.faculty, isFaculty: true, body: 'Good question. Think of it this way: start from the definition, then walk through the example from the lecture step by step.' } });
  }
  const anns = [
    [null, 'End-semester examination schedule', 'The timetable for the end-semester examinations is now available. Exams begin on 8 December.', 3],
    [null, 'Exam fee due by 5 December', 'Please pay the end-semester exam fee at the accounts office or by UPI before 5 December.', 8],
    [offs[0].id, 'Lab report deadline extended', 'The Operating Systems lab report deadline has been extended by two days.', 10],
    [offs[2].id, 'Extra tutorial on Laplace transforms', 'An extra tutorial will be held on Friday at 3 pm in Room 204.', 14],
    [null, 'Semester 2 results published', 'Semester 2 results are now available under Results.', 150],
  ] as const;
  for (const [offeringId, title, body, d] of anns) await prisma.announcement.create({ data: { offeringId, authorId: offeringId ? offs.find((o) => o.id === offeringId)!.faculty : admin.id, title, body, createdAt: ago(d) } });
  const aarav = baseStudents[0];
  await prisma.notification.createMany({
    data: [
      { userId: aarav.id, type: 'GRADE_PUBLISHED', title: 'New grade: Problem set 2', body: 'Your Operating Systems grade has been published.', link: '/courses', createdAt: ago(2) },
      { userId: aarav.id, type: 'ANNOUNCEMENT', title: 'End-semester examination schedule', link: '/announcements', createdAt: ago(3) },
      { userId: aarav.id, type: 'FEE_DUE', title: 'Exam fee due on 5 December', link: '/fees', createdAt: ago(8) },
      { userId: aarav.id, type: 'RESULT_PUBLISHED', title: 'Semester 2 results are out', link: '/results', createdAt: ago(150), readAt: ago(149) },
      { userId: admin.id, type: 'FEE_OVERDUE', title: 'Overdue fees need follow-up', body: 'Several students have overdue Semester 3 tuition.', link: '/admin/fees', createdAt: ago(1) },
    ],
  });

  console.log('Publishing past results and issuing certificates…');
  await prisma.resultPublication.createMany({ data: [{ semesterId: sem1.id, publishedById: admin.id, publishedAt: new Date('2026-01-10T10:00:00') }, { semesterId: sem2.id, publishedById: admin.id, publishedAt: new Date('2026-06-20T10:00:00') }] });
  const certs = [];
  for (const o of offs.filter((x) => x.past)) for (const s of o.students) if ((ability.get(s.id) ?? 0) >= 0.45) certs.push({ offeringId: o.id, studentId: s.id, verificationCode: crypto.randomBytes(6).toString('hex').toUpperCase(), issuedAt: new Date(o.end.getTime() + 20 * DAY) });
  await prisma.certificate.createMany({ data: certs });
  await prisma.revisionStreak.upsert({ where: { studentId: aarav.id }, create: { studentId: aarav.id, currentStreak: 6, longestStreak: 11, lastCompletedDate: new Date(NOW - DAY).toISOString().slice(0, 10) }, update: {} });

  console.log('Creating AI usage…');
  await prisma.aIUsageRecord.createMany({
    data: Array.from({ length: 70 }, () => {
      const content = chance(0.25);
      const inputTokens = content ? int(4000, 12000) : int(600, 2500), outputTokens = content ? int(2000, 6000) : int(200, 900);
      return { userId: content ? pick([fac1, fac2, fac3, fac4]).id : pick(allStudents).id, feature: content ? 'CONTENT' as const : 'HOMEWORK' as const, model: 'demo-model', inputTokens, outputTokens, estimatedCostUsd: Number(((inputTokens * 3 + outputTokens * 15) / 1e6).toFixed(6)), createdAt: ago(int(0, 29)) };
    }),
  });

  console.log('Creating fees and payments…');
  const METHODS: PaymentMethod[] = ['UPI', 'UPI', 'UPI', 'UPI', 'BANK_TRANSFER', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CASH', 'CASH', 'CARD', 'CHEQUE', 'ONLINE'];
  const payments: { studentFeeId: string; amount: number; method: PaymentMethod; reference: string | null; receiptNo: string; paidAt: Date; recordedById: string }[] = [];
  const pay = (studentFeeId: string, amount: number, when: Date) => {
    const method = pick(METHODS), paidAt = past(when);
    payments.push({ studentFeeId, amount: r2(amount), method, paidAt, recordedById: admin.id,
      reference: method === 'UPI' ? `UPI${int(100000000, 999999999)}` : method === 'BANK_TRANSFER' ? `UTR${int(10000000, 99999999)}` : method === 'CHEQUE' ? `CHQ ${int(100000, 999999)}` : null,
      receiptNo: `RCT-${paidAt.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}` });
  };
  // plan: [name, amount, due, semester, who, outcome weights {paid, partial, unpaid}, scholarship share]
  const structures = [
    { name: 'Semester 2 Tuition', amount: 42000, due: '2026-01-31', sem: sem2.id, who: cseStudents, paid: 0.97, partial: 0.03, scholarship: 0.1, desc: 'Tuition for Semester 2, academic year 2025-26.' },
    { name: MARKER, amount: 45000, due: '2026-08-14', sem: sem3.id, who: allStudents, paid: 0.66, partial: 0.18, scholarship: 0.12, desc: 'Tuition for Semester 3, academic year 2026-27. Payable in up to two instalments.' },
    { name: 'Hostel & Mess — Semester 3', amount: 28000, due: '2026-08-31', sem: sem3.id, who: allStudents.filter(() => chance(0.45)), paid: 0.78, partial: 0.12, scholarship: 0, desc: 'Hostel accommodation and mess charges.' },
    { name: 'Bus Transport 2026-27', amount: 12000, due: '2026-07-31', sem: null, who: allStudents.filter(() => chance(0.3)), paid: 0.85, partial: 0.05, scholarship: 0, desc: 'Annual college bus pass.' },
    { name: 'Library & Lab Fee 2026-27', amount: 6500, due: '2026-09-30', sem: null, who: allStudents, paid: 0.8, partial: 0, scholarship: 0, desc: 'Library membership and laboratory consumables for the year.' },
    { name: 'End-Semester Exam Fee', amount: 2500, due: '2026-12-05', sem: sem3.id, who: allStudents, paid: 0.42, partial: 0, scholarship: 0, desc: 'Examination fee for the Semester 3 end-semester exams.' },
  ];
  for (const st of structures) {
    const s = await prisma.feeStructure.create({ data: { name: st.name, description: st.desc, amount: st.amount, dueDate: new Date(st.due), semesterId: st.sem, createdAt: new Date(new Date(st.due).getTime() - 45 * DAY) } });
    const who = st.name.startsWith('Hostel') ? st.who.filter((x) => x.id !== aarav.id) : st.who; // Aarav is a day scholar
    for (const stu of who) {
      const waived = st.name === 'Bus Transport 2026-27' && chance(0.08);
      const discount = waived ? st.amount : chance(st.scholarship) ? Math.round(st.amount / 3 / 500) * 500 : 0;
      const fee = await prisma.studentFee.create({ data: { structureId: s.id, studentId: stu.id, amount: st.amount, discount, dueDate: new Date(st.due), createdAt: new Date(new Date(st.due).getTime() - 40 * DAY) } });
      const net = st.amount - discount;
      if (net <= 0) continue;
      const due = at(st.due);
      // Aarav: Semester 3 tuition in two instalments, exam fee still pending — gives the student view a realistic mix.
      if (stu.id === aarav.id && st.name === MARKER) { pay(fee.id, 25000, new Date(due.getTime() - 20 * DAY)); pay(fee.id, net - 25000, new Date(due.getTime() + 18 * DAY)); continue; }
      if (stu.id === aarav.id && st.name === 'End-Semester Exam Fee') continue;
      const x = rnd();
      if (x < st.paid) {
        if (net > 20000 && chance(0.35)) { const first = Math.round(net * 0.55 / 1000) * 1000; pay(fee.id, first, new Date(due.getTime() - int(10, 30) * DAY)); pay(fee.id, net - first, new Date(due.getTime() + int(-5, 25) * DAY)); }
        else pay(fee.id, net, new Date(due.getTime() - int(-12, 30) * DAY));
      } else if (x < st.paid + st.partial) pay(fee.id, Math.round(net * (0.3 + rnd() * 0.4) / 500) * 500, new Date(due.getTime() - int(0, 20) * DAY));
    }
  }
  await chunked(payments, (c) => prisma.feePayment.createMany({ data: c }));

  console.log('Creating audit history…');
  const staff = [admin, fac1, fac2, fac3, fac4];
  const audits = [];
  for (let d = 13; d >= 0; d--) {
    const weekend = [0, 6].includes(new Date(NOW - d * DAY).getDay());
    for (let k = int(weekend ? 3 : 10, weekend ? 8 : 22); k > 0; k--) { const u = chance(0.7) ? pick(allStudents) : pick(staff); audits.push({ actorId: u.id, action: 'LOGIN', entityType: 'User', entityId: u.id, ip: `10.0.${int(1, 9)}.${int(2, 250)}`, createdAt: past(ago(d)), metadata: { demo: true } }); }
    for (let k = int(weekend ? 0 : 3, weekend ? 3 : 9); k > 0; k--) {
      const [action, entityType] = pick([['GRADE_PUBLISHED', 'Submission'], ['ATTENDANCE_MARKED', 'ClassSession'], ['ASSIGNMENT_CREATED', 'Assignment'], ['FEE_PAYMENT_RECORDED', 'StudentFee'], ['LESSON_PUBLISHED', 'Lesson'], ['ANNOUNCEMENT_CREATED', 'Announcement'], ['USER_UPDATED', 'User']] as const);
      audits.push({ actorId: action === 'FEE_PAYMENT_RECORDED' || action === 'USER_UPDATED' ? admin.id : pick(staff.slice(1)).id, action, entityType, entityId: null, ip: `10.0.1.${int(2, 250)}`, createdAt: past(ago(d)), metadata: { demo: true } });
    }
  }
  await chunked(audits, (c) => prisma.auditLog.createMany({ data: c }));

  console.log(`Done. Added ${newStudents.length} students, 2 faculty, ${offs.length} offerings, ${events.length} learning events, ${payments.length} fee payments, ${certs.length} certificates.`);
  console.log(`Sign in with any demo account (password: ${PASSWORD}), e.g. admin@${DOMAIN}, faculty3@${DOMAIN}, student@${DOMAIN}, parent2@${DOMAIN}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
