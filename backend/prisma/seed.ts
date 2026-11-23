// Fictional demo data for local development. Idempotent: does nothing if already seeded. Never deletes data.
import { PrismaClient, type RoleName } from '@prisma/client';
import argon2 from 'argon2';
import 'dotenv/config';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'Demo@Pass2026';
const DOMAIN = 'northbridge.test'; // reserved .test TLD — not a real domain
const day = 86400000;

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');
  if (await prisma.user.findUnique({ where: { email: `superadmin@${DOMAIN}` } })) {
    console.log('Demo data already present — nothing to do.');
    return;
  }
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const mk = (email: string, firstName: string, lastName: string, roles: RoleName[]) =>
    prisma.user.create({ data: { email: `${email}@${DOMAIN}`, firstName, lastName, passwordHash, roles: { create: roles.map((role) => ({ role })) } } });

  await prisma.collegeSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', name: 'Northbridge College of Engineering', shortName: 'NCE', timeZone: 'Asia/Kolkata', supportEmail: `support@${DOMAIN}`, emailFromName: 'NCE Learning' },
    update: {},
  });
  for (const key of ['doubtBoard', 'aiHomework', 'aiContent', 'classInsights', 'dailyRevision', 'parentPortal', 'discussions']) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: true }, update: {} });
  }

  const superAdmin = await mk('superadmin', 'Sam', 'Rao', ['SUPER_ADMIN']);
  const admin = await mk('admin', 'Anita', 'Desai', ['COLLEGE_ADMIN']);
  const fac1 = await mk('faculty', 'Ravi', 'Menon', ['FACULTY']);
  const fac2 = await mk('faculty2', 'Meera', 'Iyer', ['FACULTY']);
  const names = [['Aarav', 'Shah'], ['Diya', 'Patel'], ['Kabir', 'Nair'], ['Ishita', 'Verma'], ['Rohan', 'Gupta'], ['Sara', 'Khan']];
  const students = [];
  for (const [i, [f, l]] of names.entries()) students.push(await mk(i === 0 ? 'student' : `student${i + 1}`, f, l, ['STUDENT']));
  const parent = await mk('parent', 'Nikhil', 'Shah', ['PARENT']);

  const cse = await prisma.department.create({ data: { code: 'CSE', name: 'Computer Science & Engineering' } });
  await prisma.department.create({ data: { code: 'ECE', name: 'Electronics & Communication Engineering' } });
  const prog = await prisma.program.create({ data: { departmentId: cse.id, code: 'BTECH-CSE', name: 'B.Tech Computer Science', durationSemesters: 8 } });
  const batch = await prisma.batch.create({ data: { programId: prog.id, name: '2025-2029' } });
  const section = await prisma.section.create({ data: { batchId: batch.id, name: 'A' } });
  const ay = await prisma.academicYear.create({ data: { label: '2026-27', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30') } });
  const sem = await prisma.semester.create({ data: { academicYearId: ay.id, name: 'Semester 3', startDate: new Date('2026-07-15'), endDate: new Date('2026-12-20') } });

  const dbms = await prisma.course.create({ data: { departmentId: cse.id, code: 'CS301', title: 'Database Management Systems', credits: 4, description: 'Relational model, ER modelling, normalization, SQL and transactions.' } });
  const ds = await prisma.course.create({ data: { departmentId: cse.id, code: 'CS302', title: 'Data Structures', credits: 4 } });
  const off = await prisma.courseOffering.create({ data: { courseId: dbms.id, semesterId: sem.id, sectionId: section.id, status: 'PUBLISHED', aiPolicy: { create: {} }, revisionPolicy: { create: {} } } });
  const off2 = await prisma.courseOffering.create({ data: { courseId: ds.id, semesterId: sem.id, sectionId: section.id, status: 'DRAFT', aiPolicy: { create: {} }, revisionPolicy: { create: {} } } });
  await prisma.instructorAssignment.createMany({ data: [{ facultyId: fac1.id, offeringId: off.id }, { facultyId: fac2.id, offeringId: off2.id }] });
  await prisma.enrollment.createMany({ data: students.map((s) => ({ studentId: s.id, offeringId: off.id })) });

  const topicNames = ['ER Modelling', 'Normalization', 'SQL Joins', 'Transactions'];
  const topics = Object.fromEntries(await Promise.all(topicNames.map(async (name) => [name, await prisma.topic.create({ data: { offeringId: off.id, name } })])));

  const m1 = await prisma.courseModule.create({ data: { offeringId: off.id, title: 'Unit 1 — Foundations', position: 0 } });
  const m2 = await prisma.courseModule.create({ data: { offeringId: off.id, title: 'Unit 2 — Querying & Transactions', position: 1 } });
  const lesson = (moduleId: string, title: string, position: number, topic: string, content: string, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') =>
    prisma.lesson.create({ data: { moduleId, offeringId: off.id, title, position, content, status, topics: { create: [{ topicId: topics[topic].id }] } } });
  const l1 = await lesson(m1.id, 'Introduction to ER Modelling', 0, 'ER Modelling',
    'An Entity–Relationship (ER) model describes data as entities, attributes and relationships.\n\nEntities are things we store data about (Student, Course). Attributes describe them (name, credits). Relationships connect entities (Student ENROLLS IN Course), with cardinality such as one-to-many or many-to-many.');
  const l2 = await lesson(m1.id, 'Normalization: 1NF to BCNF', 1, 'Normalization',
    'Normalization removes redundancy and update anomalies.\n\n1NF: atomic values, no repeating groups.\n2NF: 1NF and no partial dependency on part of a composite key.\n3NF: 2NF and no transitive dependency of non-key attributes.\nBCNF: every determinant is a candidate key.');
  const l3 = await lesson(m2.id, 'SQL Joins', 0, 'SQL Joins',
    'INNER JOIN returns matching rows from both tables. LEFT JOIN keeps all rows from the left table. RIGHT JOIN keeps all rows from the right table. FULL OUTER JOIN keeps all rows from both.');
  await lesson(m2.id, 'Transactions & ACID', 1, 'Transactions', 'Draft lesson on atomicity, consistency, isolation and durability.', 'DRAFT');
  await prisma.lessonResource.create({ data: { lessonId: l2.id, title: 'Normalization reference (external)', type: 'LINK', url: 'https://www.postgresql.org/docs/16/ddl-constraints.html' } });

  // Question bank (approved) — two versions on one question to show version history.
  const q = async (topic: string, type: 'MCQ' | 'TRUE_FALSE' | 'MULTI' | 'SHORT', prompt: string, options: { id: string; text: string }[], correctAnswer: unknown, explanation: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM') => {
    const question = await prisma.question.create({
      data: { offeringId: off.id, topicId: topics[topic].id, createdById: fac1.id, type, difficulty, status: 'APPROVED', versions: { create: { version: 1, prompt, options, correctAnswer: correctAnswer as any, explanation, points: type === 'SHORT' ? 3 : 1 } } },
      include: { versions: true },
    });
    return question.versions[0];
  };
  const tf = [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
  const abcd = (xs: string[]) => xs.map((text, i) => ({ id: 'abcd'[i], text }));
  const qv = [
    await q('Normalization', 'MCQ', 'A relation in 2NF must also be in:', abcd(['1NF', '3NF', 'BCNF', '4NF']), 'a', '2NF is defined on top of 1NF.', 'EASY'),
    await q('Normalization', 'MCQ', 'Which dependency does 3NF eliminate?', abcd(['Partial', 'Transitive', 'Multivalued', 'Join']), 'b', '3NF removes transitive dependencies of non-key attributes on the key.'),
    await q('Normalization', 'TRUE_FALSE', 'Every relation in BCNF is also in 3NF.', tf, 'true', 'BCNF is stricter than 3NF.'),
    await q('SQL Joins', 'MCQ', 'Which join keeps all rows from the left table?', abcd(['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN']), 'b', 'LEFT JOIN preserves the left table.', 'EASY'),
    await q('SQL Joins', 'MULTI', 'Which joins can produce NULLs in result columns?', abcd(['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN']), ['b', 'c', 'd'], 'Outer joins fill missing matches with NULL.', 'HARD'),
    await q('ER Modelling', 'MCQ', 'A Student can enrol in many Courses and a Course has many Students. This is:', abcd(['One-to-one', 'One-to-many', 'Many-to-many', 'Recursive']), 'c', 'Both sides are "many".'),
    await q('ER Modelling', 'TRUE_FALSE', 'An attribute can itself have attributes in a basic ER model.', tf, 'false', 'Composite attributes exist, but attributes do not have their own attributes.'),
    await q('Normalization', 'SHORT', 'Explain, with an example, why update anomalies occur in an unnormalized table.', [], [], 'Look for redundancy causing inconsistent updates.', 'HARD'),
  ];

  const now = Date.now();
  const quiz = await prisma.quiz.create({
    data: { offeringId: off.id, title: 'Normalization & Joins — Quiz 1', description: 'Short quiz on Units 1–2.', status: 'PUBLISHED', timeLimitMinutes: 20, maxAttempts: 2, resultsPublished: true,
      questions: { create: qv.slice(0, 5).map((v, position) => ({ questionVersionId: v.id, position })) } },
  });

  // Students 1–4 completed a graded attempt (fictional data so Class Insights has something to show).
  const pattern = [[true, true, true, true, true], [true, false, true, true, false], [true, false, false, true, false], [false, false, true, false, false]];
  for (const [i, answersCorrect] of pattern.entries()) {
    const att = await prisma.quizAttempt.create({ data: { quizId: quiz.id, studentId: students[i].id, attemptNo: 1, status: 'GRADED', startedAt: new Date(now - 3 * day), submittedAt: new Date(now - 3 * day + 600000), score: answersCorrect.filter(Boolean).length, maxScore: 5 } });
    for (const [j, ok] of answersCorrect.entries()) {
      const v = qv[j];
      const wrongAnswer = v.correctAnswer === 'a' ? 'c' : v.correctAnswer === 'true' ? 'false' : Array.isArray(v.correctAnswer) ? ['a'] : 'a';
      await prisma.attemptAnswer.create({ data: { attemptId: att.id, questionVersionId: v.id, answer: (ok ? v.correctAnswer : wrongAnswer) as any, isCorrect: ok, pointsAwarded: ok ? 1 : 0 } });
    }
  }

  const a1 = await prisma.assignment.create({ data: { offeringId: off.id, title: 'ER Diagram for a Library System', instructions: 'Draw an ER diagram for a college library: books, members, loans and fines. Mark keys and cardinalities. Upload a PDF or image.', dueAt: new Date(now + 7 * day), maxPoints: 20, status: 'PUBLISHED', allowLate: true, latePenaltyPct: 10 } });
  const a2 = await prisma.assignment.create({ data: { offeringId: off.id, title: 'Normalize the Orders Table', instructions: 'Normalize the given Orders(order_id, customer, customer_city, item, item_price, qty) table to 3NF. Show each step.', dueAt: new Date(now - 2 * day), maxPoints: 10, status: 'PUBLISHED' } });
  for (const [i, s] of students.slice(0, 4).entries()) {
    await prisma.submission.create({ data: { assignmentId: a2.id, studentId: s.id, content: 'Step 1: split repeating groups…', submittedAt: new Date(now - 3 * day), status: i < 3 ? 'GRADED' : 'SUBMITTED', score: i < 3 ? [9, 7, 6][i] : null, feedback: i < 3 ? 'Good decomposition; check the transitive dependency on customer_city.' : null, gradedById: i < 3 ? fac1.id : null, gradedAt: i < 3 ? new Date(now - day) : null, gradePublishedAt: i < 2 ? new Date(now - day) : null } });
  }
  void a1;

  for (const s of students.slice(0, 5)) await prisma.lessonProgress.create({ data: { lessonId: l1.id, studentId: s.id, completedAt: new Date(now - 5 * day) } });
  for (const s of students.slice(0, 3)) await prisma.lessonProgress.create({ data: { lessonId: l2.id, studentId: s.id, completedAt: new Date(now - 4 * day) } });
  await prisma.lessonProgress.create({ data: { lessonId: l3.id, studentId: students[0].id, completedAt: new Date(now - day) } });
  for (const [i, s] of students.entries()) {
    await prisma.learningEvent.createMany({ data: [{ userId: s.id, offeringId: off.id, resourceType: 'LESSON', resourceId: l1.id, type: 'VIEWED', occurredAt: new Date(now - (i + 1) * day) }] });
  }

  const d1 = await prisma.doubt.create({ data: { offeringId: off.id, lessonId: l2.id, topicId: topics['Normalization'].id, authorId: students[2].id, title: 'How is BCNF different from 3NF in practice?', body: 'I understand the definitions but cannot see an example where a 3NF table is not in BCNF.', voteCount: 3 } });
  await prisma.doubtVote.createMany({ data: [students[0], students[1], students[3]].map((s) => ({ doubtId: d1.id, studentId: s.id })) });
  const d2 = await prisma.doubt.create({ data: { offeringId: off.id, lessonId: l3.id, topicId: topics['SQL Joins'].id, authorId: students[1].id, title: 'When should I use a LEFT JOIN instead of INNER JOIN?', body: 'Is there a rule of thumb?', voteCount: 1, status: 'ANSWERED' } });
  await prisma.doubtVote.create({ data: { doubtId: d2.id, studentId: students[4].id } });
  await prisma.doubtReply.create({ data: { doubtId: d2.id, authorId: fac1.id, isFaculty: true, body: 'Use LEFT JOIN when you need every row from the left table even if there is no match — e.g. listing all students including those with no submissions.' } });

  const sess = await prisma.classSession.create({ data: { offeringId: off.id, title: 'Lecture 12 — Normal forms', startsAt: new Date(now - 2 * day), endsAt: new Date(now - 2 * day + 3600000) } });
  await prisma.classSession.create({ data: { offeringId: off.id, title: 'Lecture 13 — Joins workshop', startsAt: new Date(now + day), endsAt: new Date(now + day + 3600000), meetingUrl: 'https://meet.example.com/cs301-lecture-13' } });
  await prisma.attendanceRecord.createMany({ data: students.map((s, i) => ({ sessionId: sess.id, studentId: s.id, status: i === 5 ? 'ABSENT' : i === 4 ? 'LATE' : 'PRESENT', markedById: fac1.id })) });

  const link = await prisma.parentStudentLink.create({ data: { parentId: parent.id, studentId: students[0].id, relationship: 'Father', status: 'ACTIVE', verifiedAt: new Date(), verifiedById: admin.id } });
  await prisma.parentAccessConsent.create({ data: { linkId: link.id, scope: ['PROGRESS', 'GRADES', 'ATTENDANCE'], grantedById: admin.id } });

  await prisma.announcement.create({ data: { offeringId: off.id, authorId: fac1.id, title: 'Quiz 1 results are out', body: 'Review the explanations for the questions you missed before Lecture 13.' } });
  await prisma.announcement.create({ data: { authorId: admin.id, title: 'Welcome to the new learning platform', body: 'All Semester 3 courses are now available here.' } });
  void superAdmin;

  console.log(`Seeded demo data. Sign in with any of these (password: ${PASSWORD}):`);
  for (const e of ['superadmin', 'admin', 'faculty', 'student', 'parent']) console.log(`  ${e}@${DOMAIN}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
