// Fictional topic-level practice data so "My learning path" (weak topics + improvement feedback) and Class Insights have evidence.
// Run after `db:seed` + `db:demo`: `npm run db:topics`. Idempotent (skips courses already done). Never deletes data. Refuses production.
// Adds per course: real topics, lesson↔topic tags, topic tags on existing quiz questions, approved practice questions,
// per-question answers for graded quiz attempts (score recomputed to match), and ~5 weeks of daily-revision history.
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const DAY = 86400000;
const NOW = Date.now();
const MARK = 'Practice: '; // prefix on generated practice questions = idempotency marker

let seed = 4242;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
const clamp = (x: number) => Math.min(0.97, Math.max(0.05, x));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Q = [prompt: string, options: string[], correct: number, explanation: string];
// Topic order matters: topics[0..1] → Unit 1 lessons, topics[2] → Unit 2, topics[3] → Unit 3.
const SPEC: Record<string, { topic: string; qs: Q[] }[]> = {
  CS303: [
    { topic: 'Processes & Threads', qs: [
      ['Which of these is shared by all threads of the same process?', ['Stack', 'Program counter', 'Heap memory', 'Register set'], 2, 'Threads share the code, data and heap; each has its own stack and registers.'],
      ['A process moves from Running to Ready when…', ['It requests I/O', 'Its time slice expires', 'It terminates', 'It is created'], 1, 'Pre-emption at the end of a time slice returns it to the ready queue.']] },
    { topic: 'CPU Scheduling', qs: [
      ['Which scheduling algorithm can starve long jobs?', ['FCFS', 'Round Robin', 'Shortest Job First', 'FIFO'], 2, 'SJF keeps picking short jobs, so long jobs may wait indefinitely.'],
      ['Round Robin performance depends most on…', ['The time quantum', 'Disk speed', 'Number of files', 'Page size'], 0, 'Too small a quantum adds switching overhead; too large behaves like FCFS.']] },
    { topic: 'Synchronization & Deadlocks', qs: [
      ['Which is NOT a necessary condition for deadlock?', ['Mutual exclusion', 'Hold and wait', 'Pre-emption', 'Circular wait'], 2, 'Deadlock needs NO pre-emption; allowing pre-emption breaks it.'],
      ['A semaphore initialised to 1 is typically used as a…', ['Counter of free buffers', 'Mutex lock', 'Timer', 'Page table'], 1, 'A binary semaphore gives mutual exclusion.']] },
    { topic: 'Memory Management', qs: [
      ['Thrashing happens when a process…', ['Waits for I/O', 'Spends more time paging than executing', 'Has too many threads', 'Fills the cache'], 1, 'Too few frames → constant page faults → little useful work.'],
      ["Belady's anomaly can occur with which page replacement algorithm?", ['LRU', 'Optimal', 'FIFO', 'LFU'], 2, 'With FIFO, more frames can cause more page faults.']] },
  ],
  CS304: [
    { topic: 'OSI & TCP/IP Layers', qs: [
      ['At which layer does a router primarily operate?', ['Physical', 'Data link', 'Network', 'Transport'], 2, 'Routers forward packets using network-layer (IP) addresses.'],
      ['HTTP belongs to which TCP/IP layer?', ['Application', 'Transport', 'Internet', 'Link'], 0, 'HTTP is an application-layer protocol running over TCP.']] },
    { topic: 'IP Addressing & Subnetting', qs: [
      ['How many usable hosts are in a /26 subnet?', ['64', '62', '30', '126'], 1, '2^6 = 64 addresses minus network and broadcast = 62.'],
      ['Which is a private IPv4 address?', ['8.8.8.8', '172.16.5.4', '100.0.0.1', '193.1.1.1'], 1, '172.16.0.0/12 is a private range (RFC 1918).']] },
    { topic: 'Routing', qs: [
      ['OSPF is a…', ['Distance-vector protocol', 'Link-state protocol', 'Path-vector protocol', 'Transport protocol'], 1, 'OSPF floods link-state adverts and runs Dijkstra.'],
      ['RIP chooses routes using which metric?', ['Bandwidth', 'Delay', 'Hop count', 'Cost'], 2, 'RIP counts hops (max 15).']] },
    { topic: 'Transport Layer (TCP/UDP)', qs: [
      ['Which TCP mechanism stops a sender overwhelming the receiver?', ['Congestion window', 'Flow control (receive window)', 'Checksum', 'Three-way handshake'], 1, 'The receive window advertises how much the receiver can buffer.'],
      ['Which protocol is connectionless?', ['TCP', 'UDP', 'FTP', 'SSH'], 1, 'UDP sends datagrams without a connection or delivery guarantee.']] },
  ],
  EC301: [
    { topic: 'Signal Classification', qs: [
      ['x(t) = cos(2πt) is…', ['Aperiodic', 'Periodic with period 1 s', 'Periodic with period 2π s', 'Random'], 1, 'ω = 2π rad/s → T = 2π/ω = 1 s.'],
      ['An energy signal has…', ['Finite energy and zero average power', 'Infinite energy', 'Finite non-zero power', 'Zero energy'], 0, 'Finite total energy implies zero average power.']] },
    { topic: 'LTI Systems & Convolution', qs: [
      ['An LTI system output is the input convolved with its…', ['Step response', 'Impulse response', 'Transfer gain', 'Frequency'], 1, 'y(t) = x(t) * h(t).'],
      ['An LTI system is BIBO stable if its impulse response is…', ['Periodic', 'Absolutely integrable', 'Even', 'Causal'], 1, '∫|h(t)|dt < ∞ is the BIBO condition.']] },
    { topic: 'Fourier Analysis', qs: [
      ['The Fourier transform of a rectangular pulse is a…', ['Sinc function', 'Impulse', 'Gaussian', 'Step'], 0, 'rect ↔ sinc is a standard transform pair.'],
      ["Shifting a signal in time changes its Fourier transform's…", ['Magnitude', 'Phase', 'Bandwidth', 'Energy'], 1, 'A time shift multiplies by e^(−jωt₀): phase only.']] },
    { topic: 'Laplace & Z Transforms', qs: [
      ['The ROC of a causal (right-sided) signal lies…', ['Left of the leftmost pole', 'Right of the rightmost pole', 'Between poles', 'Nowhere'], 1, 'Right-sided signals have ROC to the right of the rightmost pole.'],
      ['A causal discrete-time system is stable if all poles lie…', ['Outside the unit circle', 'Inside the unit circle', 'On the imaginary axis', 'In the right half plane'], 1, 'Stability ⇔ ROC includes the unit circle.']] },
  ],
  EC302: [
    { topic: 'Boolean Algebra & K-maps', qs: [
      ["A + A'B simplifies to…", ['A', 'B', 'A + B', 'AB'], 2, "Absorption: A + A'B = A + B."],
      ['A 4-variable K-map has how many cells?', ['8', '16', '4', '32'], 1, '2⁴ = 16 cells.']] },
    { topic: 'Combinational Circuits', qs: [
      ['A multiplexer with 3 select lines has how many data inputs?', ['3', '6', '8', '16'], 2, '2³ = 8 inputs.'],
      ['A full adder has how many inputs?', ['2', '3', '4', '1'], 1, 'A, B and carry-in.']] },
    { topic: 'Flip-flops', qs: [
      ['Which flip-flop toggles when both inputs are 1?', ['SR', 'D', 'JK', 'Latch'], 2, 'J = K = 1 → toggle.'],
      ['The race-around condition occurs in a…', ['D flip-flop', 'Level-triggered JK flip-flop', 'T latch', 'Edge-triggered D flip-flop'], 1, 'Output toggles repeatedly while the clock level is high.']] },
    { topic: 'Counters & FSMs', qs: [
      ['A mod-10 counter needs at least how many flip-flops?', ['3', '4', '5', '10'], 1, '2³ = 8 < 10 ≤ 16 = 2⁴.'],
      ['In a Moore machine the output depends on…', ['Inputs only', 'Present state only', 'Inputs and state', 'The clock only'], 1, 'Moore outputs are a function of state alone.']] },
  ],
  EC303: [
    { topic: '8085 Architecture', qs: [
      ['The 8085 address bus is…', ['8 bits', '16 bits', '20 bits', '32 bits'], 1, '16-bit address bus → 64 KB memory.'],
      ['Which register holds the address of the next instruction?', ['Stack pointer', 'Program counter', 'Accumulator', 'Flag register'], 1, 'The PC points to the next instruction.']] },
    { topic: 'Instruction Set & Addressing', qs: [
      ['MVI A, 32H uses which addressing mode?', ['Direct', 'Register', 'Immediate', 'Indirect'], 2, 'The data (32H) is in the instruction itself.'],
      ['LDA 2050H uses which addressing mode?', ['Immediate', 'Direct', 'Register indirect', 'Implied'], 1, 'The operand address is given directly.']] },
    { topic: 'Interrupts', qs: [
      ['Which 8085 interrupt is non-maskable?', ['RST 7.5', 'INTR', 'TRAP', 'RST 5.5'], 2, 'TRAP cannot be masked.'],
      ['Which 8085 interrupt is edge-triggered only?', ['TRAP', 'RST 7.5', 'RST 6.5', 'INTR'], 1, 'RST 7.5 is rising-edge triggered.']] },
    { topic: 'Memory & I/O Interfacing', qs: [
      ['The 8255 PPI provides how many I/O ports?', ['1', '2', '3', '4'], 2, 'Ports A, B and C.'],
      ['Memory-mapped I/O devices are accessed with…', ['IN/OUT instructions', 'Memory transfer instructions', 'Stack instructions only', 'Interrupt instructions'], 1, 'They occupy memory addresses, so LDA/STA/MOV work.']] },
  ],
};

/**
 * Probability a student answers a topic correctly at a given time. Deterministic per (student, course):
 * one weak topic, one improving topic, and for ~half the students one slipping topic — so feedback has something real to say.
 */
function skill(studentId: string, offeringId: string, topicIdx: number, n: number, at: number) {
  const h = hash(studentId + offeringId);
  const weak = h % n, improving = (weak + 1) % n, slipping = h % 2 ? (weak + 2) % n : -1;
  const base = 0.82 + ((h >> 4) % 14) / 100; // 0.82–0.95 for topics the student is fine on
  const recent = NOW - at < 14 * DAY;
  if (topicIdx === weak) return 0.35;
  if (topicIdx === improving) return recent ? 0.85 : 0.4;
  if (topicIdx === slipping) return recent ? 0.4 : 0.85;
  return base;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to load demo data in production');
  const offerings = await prisma.courseOffering.findMany({
    where: { status: 'PUBLISHED' },
    include: { course: { select: { code: true } }, instructors: { select: { facultyId: true }, take: 1 }, topics: { orderBy: { name: 'asc' } } },
  });
  const revDates: Record<string, Set<string>> = {};

  for (const o of offerings) {
    const spec = SPEC[o.course.code];
    if (!spec && !o.topics.length) continue;
    if (await prisma.questionVersion.count({ where: { prompt: { startsWith: MARK }, question: { offeringId: o.id } } }) ||
        (!spec && await prisma.revisionQuiz.count({ where: { offeringId: o.id, scheduledLocalDate: { lt: ymd(new Date(NOW - DAY)) } } }))) {
      console.log(`${o.course.code}: already has practice data — skipped`);
      continue;
    }
    const faculty = o.instructors[0]?.facultyId;
    if (!faculty) continue;

    // 1. Topics + lesson tags (only for courses that had none).
    let topics = o.topics;
    if (spec) {
      topics = [];
      for (const s of spec) topics.push(await prisma.topic.upsert({ where: { offeringId_name: { offeringId: o.id, name: s.topic } }, create: { offeringId: o.id, name: s.topic }, update: {} }));
      const lessons = await prisma.lesson.findMany({ where: { offeringId: o.id }, select: { id: true, module: { select: { position: true } } } });
      const unitTopics = [[0, 1], [2], [3]];
      await prisma.lessonTopic.createMany({ data: lessons.flatMap((l) => (unitTopics[l.module.position] ?? []).map((i) => ({ lessonId: l.id, topicId: topics[i].id }))), skipDuplicates: true });

      // 2. Tag existing untagged quiz questions round-robin, then add approved practice questions.
      const untagged = await prisma.question.findMany({ where: { offeringId: o.id, topicId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      for (const [i, q] of untagged.entries()) await prisma.question.update({ where: { id: q.id }, data: { topicId: topics[i % topics.length].id } });
      for (const [ti, s] of spec.entries()) {
        for (const [prompt, opts, correct, explanation] of s.qs) {
          await prisma.question.create({ data: { offeringId: o.id, topicId: topics[ti].id, createdById: faculty, type: 'MCQ', status: 'APPROVED', difficulty: 'MEDIUM',
            versions: { create: { version: 1, prompt: `${MARK}${prompt}`, options: opts.map((text, k) => ({ id: 'abcd'[k], text })), correctAnswer: 'abcd'[correct], explanation, points: 1 } } } });
        }
      }
    }
    const tIndex = new Map(topics.map((t, i) => [t.id, i]));
    const n = topics.length;

    // 3. Per-question answers for graded attempts that only had a total score; recompute the score so they agree.
    const attempts = await prisma.quizAttempt.findMany({
      where: { status: 'GRADED', quiz: { offeringId: o.id }, answers: { none: {} } },
      include: { quiz: { include: { questions: { include: { questionVersion: { include: { question: { select: { topicId: true } } } } } } } } },
    });
    for (const a of attempts) {
      const at = (a.submittedAt ?? a.startedAt).getTime();
      let score = 0, max = 0;
      const rows = a.quiz.questions.map(({ questionVersion: v }) => {
        const ti = tIndex.get(v.question.topicId ?? '') ?? 0;
        const ok = rnd() < skill(a.studentId, o.id, ti, n, at);
        max += v.points; if (ok) score += v.points;
        const key = v.correctAnswer as string;
        const wrong = (v.options as { id: string }[]).map((x) => x.id).filter((id) => id !== key);
        return { attemptId: a.id, questionVersionId: v.id, answer: ok ? key : wrong[Math.floor(rnd() * wrong.length)], isCorrect: ok, pointsAwarded: ok ? v.points : 0 };
      });
      await prisma.$transaction([prisma.attemptAnswer.createMany({ data: rows }), prisma.quizAttempt.update({ where: { id: a.id }, data: { score, maxScore: max } })]);
    }

    // 4. ~5 weeks of completed daily-revision practice (past dates only — today's quiz is still generated live).
    const pool = await prisma.questionVersion.findMany({
      where: { question: { offeringId: o.id, status: 'APPROVED', topicId: { not: null }, type: { in: ['MCQ', 'TRUE_FALSE'] } } },
      select: { id: true, correctAnswer: true, options: true, question: { select: { topicId: true } } },
    });
    if (!pool.length) continue;
    const students = (await prisma.enrollment.findMany({ where: { offeringId: o.id, status: 'ACTIVE' }, select: { studentId: true } })).map((e) => e.studentId);
    const taken = new Set((await prisma.revisionQuiz.findMany({ where: { offeringId: o.id }, select: { studentId: true, scheduledLocalDate: true } })).map((r) => `${r.studentId}|${r.scheduledLocalDate}`));
    const quizzes: any[] = [], links: any[] = [], atts: any[] = [], answers: any[] = [];
    for (const sid of students) {
      const days = [...new Set(Array.from({ length: 16 }, () => 1 + Math.floor(rnd() * 34)))].slice(0, 12);
      for (const d of days) {
        const when = new Date(NOW - d * DAY); when.setHours(19, Math.floor(rnd() * 60), 0, 0);
        const date = ymd(when);
        if (taken.has(`${sid}|${date}`)) continue;
        taken.add(`${sid}|${date}`);
        (revDates[sid] ??= new Set()).add(date);
        const qid = crypto.randomUUID(), aid = crypto.randomUUID();
        const picked = [...pool].sort(() => rnd() - 0.5).slice(0, 5);
        let score = 0;
        picked.forEach((v, position) => {
          const ok = rnd() < skill(sid, o.id, tIndex.get(v.question.topicId!) ?? 0, n, when.getTime());
          if (ok) score++;
          const key = v.correctAnswer as string;
          const wrong = (v.options as { id: string }[]).map((x) => x.id).filter((id) => id !== key);
          links.push({ revisionQuizId: qid, questionVersionId: v.id, position });
          answers.push({ attemptId: aid, questionVersionId: v.id, selectedAnswer: ok ? key : wrong[Math.floor(rnd() * wrong.length)], correct: ok });
        });
        quizzes.push({ id: qid, studentId: sid, offeringId: o.id, scheduledLocalDate: date, status: 'COMPLETED', createdAt: when });
        atts.push({ id: aid, revisionQuizId: qid, startedAt: new Date(when.getTime() - 4 * 60000), submittedAt: when, score, maxScore: picked.length });
      }
    }
    await prisma.$transaction([
      prisma.revisionQuiz.createMany({ data: quizzes }), prisma.revisionQuizQuestion.createMany({ data: links }),
      prisma.revisionAttempt.createMany({ data: atts }), prisma.revisionAnswer.createMany({ data: answers }),
    ]);
    console.log(`${o.course.code}: ${topics.length} topics, ${attempts.length} quiz attempts detailed, ${quizzes.length} revision sessions`);
  }

  // 5. Streaks consistent with the history (consecutive days ending yesterday).
  for (const [sid, set] of Object.entries(revDates)) {
    let cur = 0;
    for (let d = 1; set.has(ymd(new Date(NOW - d * DAY))); d++) cur++;
    const prev = await prisma.revisionStreak.findUnique({ where: { studentId: sid } });
    const longest = Math.max(prev?.longestStreak ?? 0, cur, 3);
    await prisma.revisionStreak.upsert({ where: { studentId: sid }, create: { studentId: sid, currentStreak: cur, longestStreak: longest, lastCompletedDate: cur ? ymd(new Date(NOW - DAY)) : null }, update: prev && prev.currentStreak >= cur ? { longestStreak: longest } : { currentStreak: cur, longestStreak: longest, lastCompletedDate: cur ? ymd(new Date(NOW - DAY)) : prev?.lastCompletedDate } });
  }
  console.log('Topic practice data loaded.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
