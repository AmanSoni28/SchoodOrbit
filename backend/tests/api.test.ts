import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app, client, email, PASSWORD } from './helpers';

let dbms: string, ds: string, studentId: string, student5Id: string;

beforeAll(async () => {
  dbms = (await prisma.courseOffering.findFirstOrThrow({ where: { course: { code: 'CS301' } } })).id;
  ds = (await prisma.courseOffering.findFirstOrThrow({ where: { course: { code: 'CS302' } } })).id;
  studentId = (await prisma.user.findUniqueOrThrow({ where: { email: email('student') } })).id;
  student5Id = (await prisma.user.findUniqueOrThrow({ where: { email: email('student5') } })).id;
});

describe('authentication & sessions', () => {
  it('all five roles can sign in and see their roles', async () => {
    for (const [u, role] of [['superadmin', 'SUPER_ADMIN'], ['admin', 'COLLEGE_ADMIN'], ['faculty', 'FACULTY'], ['student', 'STUDENT'], ['parent', 'PARENT']]) {
      const c = await client(u);
      const me = await c.get('/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.data.roles).toContain(role);
    }
  });

  it('rejects unauthenticated requests and missing CSRF token', async () => {
    expect((await request(app).get('/api/v1/offerings')).status).toBe(401);
    const c = await client('student');
    expect((await c.agent.post('/api/v1/auth/logout').send({})).status).toBe(403);
  });

  it('does not reveal whether an email exists', async () => {
    const c = await client();
    const a = await c.post('/auth/login', { email: 'nobody@northbridge.test', password: 'x' });
    const b = await c.post('/auth/login', { email: email('student2'), password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after 5 failed attempts', async () => {
    const c = await client();
    for (let i = 0; i < 5; i++) await c.post('/auth/login', { email: email('student6'), password: 'nope-nope' });
    const locked = await c.post('/auth/login', { email: email('student6'), password: PASSWORD });
    expect(locked.status).toBe(423);
    await prisma.user.update({ where: { email: email('student6') }, data: { lockedUntil: null } });
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const c = await client('student3');
    const oldCookie = c.agent.jar.getCookie('refresh_token', { domain: '127.0.0.1', path: '/api/v1/auth', secure: false, script: false } as any);
    const first = await c.post('/auth/refresh');
    expect(first.status).toBe(200);
    const replayOld = () => request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${oldCookie!.value}`).set('Authorization', 'Bearer x');
    // Immediate replay = concurrent refresh race: refused, but the session survives.
    const race = await replayOld();
    expect(race.status).toBe(401);
    expect(race.body.error.code).toBe('REFRESH_RACE');
    expect((await c.post('/auth/refresh')).status).toBe(200);
    // Replay after the grace window = theft signal → whole family revoked.
    await prisma.refreshSession.updateMany({ where: { rotatedAt: { not: null }, user: { email: email('student3') } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await replayOld()).status).toBe(401);
    expect((await c.post('/auth/refresh')).status).toBe(401);
  });

  it('suspension takes effect immediately even with a valid access token', async () => {
    const c = await client('student4');
    const admin = await client('admin');
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: email('student4') } })).id;
    expect((await admin.patch(`/users/${id}`, { status: 'SUSPENDED' })).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(401);
    await admin.patch(`/users/${id}`, { status: 'ACTIVE' });
  });
});

describe('authorization boundaries', () => {
  it('students cannot manage users; admins cannot grant super admin', async () => {
    expect((await (await client('student')).get('/users')).status).toBe(403);
    const admin = await client('admin');
    const res = await admin.post('/users', { email: 'x1@northbridge.test', firstName: 'X', lastName: 'Y', password: 'LongEnough#1', roles: ['SUPER_ADMIN'] });
    expect(res.status).toBe(403);
  });

  it('students cannot open offerings they are not enrolled in', async () => {
    const s = await client('student');
    expect((await s.get(`/offerings/${ds}`)).status).toBe(403);
    expect((await s.get(`/offerings/${ds}/modules`)).status).toBe(403);
  });

  it('faculty cannot manage offerings they are not assigned to', async () => {
    const f2 = await client('faculty2');
    expect((await f2.post(`/offerings/${dbms}/modules`, { title: 'hack' })).status).toBe(403);
    expect((await f2.get(`/offerings/${dbms}/gradebook`)).status).toBe(403);
  });
});

describe('release success criteria (PDF §01)', () => {
  it('admin creates an offering, assigns an instructor and enrolls a student', async () => {
    const admin = await client('admin');
    const course = (await admin.get('/courses')).body.data.find((c: any) => c.code === 'CS302');
    const sem = (await admin.get('/semesters')).body.data[0];
    const year = await admin.post('/academic-years', { label: '2027-28', startDate: '2027-07-01', endDate: '2028-06-30' });
    expect(year.status).toBe(201);
    const s2 = await admin.post('/semesters', { academicYearId: year.body.data.id, name: 'Semester 4', startDate: '2027-07-15', endDate: '2027-12-20' });
    expect(s2.status).toBe(201);
    const off = await admin.post('/offerings', { courseId: course.id, semesterId: s2.body.data.id });
    expect(off.status).toBe(201);
    const faculty = await prisma.user.findUniqueOrThrow({ where: { email: email('faculty2') } });
    expect((await admin.post(`/offerings/${off.body.data.id}/instructors`, { facultyId: faculty.id })).status).toBe(201);
    const enr = await admin.post(`/offerings/${off.body.data.id}/enrollments`, { emails: [email('student'), 'ghost@northbridge.test'] });
    expect(enr.body.data).toEqual({ enrolled: 1, notFound: ['ghost@northbridge.test'] });
    // Idempotent re-enrol.
    const again = await admin.post(`/offerings/${off.body.data.id}/enrollments`, { studentIds: [studentId] });
    expect(again.status).toBe(201);
    expect(await prisma.enrollment.count({ where: { offeringId: off.body.data.id } })).toBe(1);
    void sem;
  });

  it('faculty publishes a lesson; the student completes it', async () => {
    const f = await client('faculty');
    const mod = await f.post(`/offerings/${dbms}/modules`, { title: 'Unit 3' });
    const draft = await f.post(`/modules/${mod.body.data.id}/lessons`, { title: 'Indexing basics', content: 'B-trees…' });
    const s = await client('student');
    expect((await s.get(`/lessons/${draft.body.data.id}`)).status).toBe(404); // draft hidden
    await f.patch(`/lessons/${draft.body.data.id}`, { status: 'PUBLISHED' });
    expect((await s.get(`/lessons/${draft.body.data.id}`)).status).toBe(200);
    expect((await s.post(`/lessons/${draft.body.data.id}/complete`)).status).toBe(200);
    expect((await s.post(`/lessons/${draft.body.data.id}/complete`)).status).toBe(200); // idempotent
    const prog = await s.get(`/offerings/${dbms}/progress`);
    expect(prog.body.data.completed).toBeGreaterThan(0);
  });

  it('student submits an assignment; faculty grades and publishes; student sees it', async () => {
    const a = await prisma.assignment.findFirstOrThrow({ where: { title: 'ER Diagram for a Library System' } });
    const s = await client('student5');
    expect((await s.post(`/assignments/${a.id}/submissions`, { content: 'My ER diagram description' })).status).toBe(201);
    expect((await s.post(`/assignments/${a.id}/submissions`, { content: 'again' })).status).toBe(409); // no resubmission
    const sub = await prisma.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId: student5Id } });
    let view = await s.get(`/assignments/${a.id}`);
    const f = await client('faculty');
    expect((await f.patch(`/submissions/${sub.id}/grade`, { score: 25 })).status).toBe(400); // > max
    await f.patch(`/submissions/${sub.id}/grade`, { score: 17, feedback: 'Clear keys.' });
    view = await s.get(`/assignments/${a.id}`);
    expect(view.body.data.mySubmissions[0].score).toBeNull(); // not yet published
    await f.patch(`/submissions/${sub.id}/grade`, { score: 18, feedback: 'Clear keys.', publish: true });
    view = await s.get(`/assignments/${a.id}`);
    expect(Number(view.body.data.mySubmissions[0].score)).toBe(18);
    expect(await prisma.auditLog.count({ where: { entityId: sub.id, action: 'GRADE_CHANGED' } })).toBe(1);
  });

  it('student completes a quiz; the score persists and appears in the gradebook', async () => {
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { offeringId: dbms } });
    const s = await client('student5');
    const att = await s.post(`/quizzes/${quiz.id}/attempts`);
    expect(att.status).toBe(201);
    const resumed = await s.post(`/quizzes/${quiz.id}/attempts`);
    expect(resumed.body.data.id).toBe(att.body.data.id); // resume, not a new attempt
    const view = await s.get(`/attempts/${att.body.data.id}`);
    expect(view.body.data.questions[0].correctAnswer).toBeUndefined(); // key hidden while in progress
    const qvs = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id }, include: { questionVersion: true } });
    for (const q of qvs) await s.put(`/attempts/${att.body.data.id}/answers/${q.questionVersionId}`, { answer: q.questionVersion.correctAnswer as any });
    const sub1 = await s.post(`/attempts/${att.body.data.id}/submit`);
    const sub2 = await s.post(`/attempts/${att.body.data.id}/submit`);
    expect(sub1.body.data.status).toBe('GRADED');
    expect(sub2.body.data.submittedAt).toBe(sub1.body.data.submittedAt); // idempotent
    expect(Number(sub1.body.data.score)).toBe(5);
    const book = await s.get(`/offerings/${dbms}/grades/me`);
    expect(book.body.data.cells[quiz.id]).toEqual({ earned: 5, max: 5 });
    const late = await s.put(`/attempts/${att.body.data.id}/answers/${qvs[0].questionVersionId}`, { answer: 'a' });
    expect(late.status).toBe(409);
  });
});

describe('Anonymous Doubt Board', () => {
  it('never exposes authorId and counts one vote per student', async () => {
    const s = await client('student');
    const list = await s.get(`/offerings/${dbms}/doubts`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('authorId');
    const author = await client('student3');
    const created = await author.post(`/offerings/${dbms}/doubts`, { title: 'Why do we need BCNF at all?', body: 'Is 3NF not enough?' });
    expect(created.status).toBe(201);
    expect(created.body.data.mine).toBe(true);
    const id = created.body.data.id;
    const v1 = await s.post(`/doubts/${id}/votes`);
    const v2 = await s.post(`/doubts/${id}/votes`);
    expect(v1.body.data.voteCount).toBe(1);
    expect(v2.body.data.voteCount).toBe(1);
    expect((await author.post(`/doubts/${id}/votes`)).status).toBe(400); // own doubt
    const f = await client('faculty');
    const reply = await f.post(`/doubts/${id}/replies`, { body: 'BCNF removes anomalies 3NF can miss.' });
    expect(reply.body.data.authorLabel).toContain('Faculty');
    const detail = await s.get(`/doubts/${id}`);
    expect(detail.body.data.status).toBe('ANSWERED');
    expect(JSON.stringify(detail.body)).not.toContain('authorId');
  });

  it('blocks students from other offerings and lets only college admins reveal identity (audited)', async () => {
    const doubt = await prisma.doubt.findFirstOrThrow({ where: { offeringId: dbms } });
    const f2 = await client('faculty2');
    expect((await f2.get(`/offerings/${dbms}/doubts`)).status).toBe(403);
    const f = await client('faculty');
    expect((await f.post(`/doubts/${doubt.id}/reveal-identity`, { reason: 'Abusive language reported twice' })).status).toBe(403);
    const admin = await client('admin');
    const rev = await admin.post(`/doubts/${doubt.id}/reveal-identity`, { reason: 'Abusive language reported twice' });
    expect(rev.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'DOUBT_IDENTITY_REVEALED', entityId: doubt.id } })).toBe(1);
  });
});

describe('Daily Revision Quiz', () => {
  it('generates once per day from approved questions and persists answers', async () => {
    const s = await client('student');
    const a = await s.get('/revision/today');
    const b = await s.get('/revision/today');
    expect(a.body.data.items[0].quizId).toBe(b.body.data.items[0].quizId);
    expect(await prisma.revisionQuiz.count({ where: { studentId } })).toBe(1);
    const item = a.body.data.items.find((i: any) => i.offeringId === dbms);
    expect(item.status).toBe('READY');
    const att = await s.post(`/revision/quizzes/${item.quizId}/attempts`);
    const quiz = await s.get(`/revision/quizzes/${item.quizId}`);
    const first = quiz.body.data.questions[0];
    const key = await prisma.questionVersion.findUniqueOrThrow({ where: { id: first.id } });
    const ans = await s.put(`/revision/attempts/${att.body.data.id}/answers/${first.id}`, { answer: key.correctAnswer as any });
    expect(ans.body.data.correct).toBe(true);
    const done = await s.post(`/revision/attempts/${att.body.data.id}/submit`);
    expect(done.body.data.score).toBe(1);
    const hist = await s.get('/revision/history');
    expect(hist.body.data.streak.currentStreak).toBe(1);
  });

  it('returns an explicit no-content state instead of inventing questions', async () => {
    const s = await client('student6'); // has completed no lessons
    const t = await s.get('/revision/today');
    expect(t.body.data.items[0].status).toBe('NO_CONTENT');
    expect(t.body.data.items[0].questionCount).toBe(0);
  });
});

describe('AI features', () => {
  it('reports not-configured honestly when no API key is set', async () => {
    const s = await client('student');
    const status = await s.get('/ai/homework/status');
    if (status.body.data.configured) return; // a key is present in this environment
    const sess = await s.post('/ai/homework/sessions', { offeringId: dbms, mode: 'HINT' });
    expect(sess.status).toBe(201);
    const msg = await s.post(`/ai/homework/sessions/${sess.body.data.id}/messages`, { content: 'What is 2NF?' });
    expect(msg.status).toBe(503);
    expect(msg.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(await prisma.aIStudyMessage.count({ where: { sessionId: sess.body.data.id } })).toBe(0);
    // Privacy: other students, faculty and super admins cannot read the session.
    expect((await (await client('student2')).get(`/ai/homework/sessions/${sess.body.data.id}`)).status).toBe(404);
    expect((await (await client('faculty')).get(`/ai/homework/sessions/${sess.body.data.id}`)).status).toBe(403);
    expect((await (await client('superadmin')).get(`/ai/homework/sessions/${sess.body.data.id}`)).status).toBe(403);
  });

  it('students cannot use faculty generation endpoints', async () => {
    const s = await client('student');
    expect((await s.post('/ai/content/jobs', { offeringId: dbms, type: 'MCQ', useLessonContent: true })).status).toBe(403);
  });
});

describe('Class insights reconcile with source records', () => {
  it('quiz accuracy equals correct / evaluated answers', async () => {
    const f = await client('faculty');
    const o = await f.get(`/analytics/offerings/${dbms}/overview`);
    expect(o.status).toBe(200);
    const answers = await prisma.attemptAnswer.findMany({ where: { isCorrect: { not: null }, attempt: { quiz: { offeringId: dbms }, status: { not: 'IN_PROGRESS' } } } });
    const correct = answers.filter((a) => a.isCorrect).length;
    expect(o.body.data.quizAccuracy.numerator).toBe(correct);
    expect(o.body.data.quizAccuracy.denominator).toBe(answers.length);
    expect((await (await client('student')).get(`/analytics/offerings/${dbms}/overview`)).status).toBe(403);
  });
});

describe('Parent portal', () => {
  it('sees only the linked student, only published grades, and loses access on revoke', async () => {
    const p = await client('parent');
    const list = await p.get('/parent/students');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].student.id).toBe(studentId);
    expect((await p.get(`/parent/students/${studentId}/progress`)).status).toBe(200);
    expect((await p.get(`/parent/students/${student5Id}/progress`)).status).toBe(404);
    expect((await p.get('/ai/homework/sessions')).status).toBe(403);
    const s = await client('student');
    const links = await s.get('/me/parent-links');
    await s.post(`/me/parent-links/${links.body.data[0].id}/revoke`);
    expect((await p.get(`/parent/students/${studentId}/grades`)).status).toBe(403);
  });
});
