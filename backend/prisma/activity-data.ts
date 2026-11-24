// Tops up attendance, doubts, discussions, the weekly timetable and the academic calendar for every course offering that has students.
// Safe to re-run: attendance is only added to offerings with no class sessions; doubts, threads and calendar events are matched by title.
// Run after demo-data: `npm run db:activity`.
import { PrismaClient, type AttendanceStatus, type CalendarEventType, type DoubtStatus, type SlotKind } from '@prisma/client';
import { findClash, type Ctx } from '../src/modules/timetable/timetable.service';

const prisma = new PrismaClient();
const DAY = 86400000;
const NOW = Date.now();

let seed = 20261124;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const sample = <T>(xs: readonly T[], n: number) => [...xs].sort(() => rnd() - 0.5).slice(0, n);
const between = (a: Date, b: Date) => new Date(a.getTime() + rnd() * (b.getTime() - a.getTime()));
const later = (d: Date, minH: number, maxH: number) => new Date(Math.min(NOW - 3600000, d.getTime() + int(minH, maxH) * 3600000));

type D = [title: string, body: string, answer: string];
const DOUBTS: Record<string, D[]> = {
  CS101: [
    ['Why does scanf need & but printf does not?', 'In lab we wrote scanf("%d", &n) but printf("%d", n). Why the difference?', 'scanf has to write into your variable, so it needs its address. printf only reads the value, so passing the value itself is enough.'],
    ['Difference between i++ and ++i in a loop?', 'Both seem to give the same output in my for loop. When does it matter?', 'In a for-loop update they behave the same. It matters inside expressions: x = i++ assigns the old value, x = ++i assigns the new one.'],
    ['Segmentation fault when using pointers', 'My program crashes with a segfault after I declare int *p; and do *p = 5;', 'p is uninitialised, so it points to a random address. Point it at real memory first: int x; p = &x; or use malloc.'],
    ['When should I use a struct instead of arrays?', 'For the student records assignment, can I just use parallel arrays?', 'You can, but a struct keeps related fields together and makes sorting and passing records to functions much simpler.'],
    ['What does fgets do with the newline?', 'My string comparison fails after reading input with fgets.', 'fgets keeps the trailing \\n. Strip it with buf[strcspn(buf, "\\n")] = 0; before comparing.'],
  ],
  MA101: [
    ['How do I know which convergence test to use?', 'There are so many tests for series — ratio, root, comparison. How do I choose?', 'Factorials or powers → ratio test. nth powers → root test. Looks like a p-series → comparison. Always check the nth-term test first.'],
    ['Is every symmetric matrix diagonalisable?', 'The textbook says real symmetric matrices are special. Why?', 'Yes — real symmetric matrices always have real eigenvalues and an orthonormal set of eigenvectors, so they are orthogonally diagonalisable.'],
    ["When can I apply L'Hôpital's rule?", 'Can I use it for every limit that looks difficult?', 'Only for 0/0 or ∞/∞ forms. Rewrite other indeterminate forms (0·∞, 1^∞) into one of those first.'],
    ['Rank of a matrix vs number of non-zero rows', 'Are these always the same?', 'Only after reducing to row echelon form. The rank is the number of non-zero rows in echelon form.'],
    ['Taylor vs Maclaurin series', 'What is the actual difference?', 'A Maclaurin series is just a Taylor series centred at x = 0.'],
  ],
  PH101: [
    ['Why do we get fringes in Young\'s double slit?', 'I understand interference but not why the fringes are equally spaced.', 'Path difference d·sinθ changes linearly with position on the screen for small angles, so maxima repeat at equal spacing λD/d.'],
    ['What does the wave function physically mean?', 'Is ψ the particle itself?', 'ψ is not directly observable. |ψ|² gives the probability density of finding the particle at a position.'],
    ['Difference between intrinsic and extrinsic semiconductors?', 'Why does doping increase conductivity so much?', 'Intrinsic is pure; doping adds donor or acceptor levels close to the bands, creating many more free carriers at room temperature.'],
    ['Why is the photoelectric effect independent of intensity?', 'Higher intensity means more energy, so why no effect on kinetic energy?', 'Intensity changes the number of photons, not the energy per photon. Kinetic energy depends on frequency: KE = hf − φ.'],
  ],
  CS201: [
    ['Abstract class vs interface — when to use which?', 'Both can have abstract methods in Java. How do I decide?', 'Use an interface for a capability many unrelated classes share. Use an abstract class when subclasses share state or common code.'],
    ['Why is method overloading compile-time polymorphism?', 'Overriding is runtime, but why is overloading decided at compile time?', 'The compiler picks the overload from the declared argument types. Overriding depends on the actual object type, known only at runtime.'],
    ['What does super() do in a constructor?', 'Is it required in every subclass constructor?', 'It calls the parent constructor. Java inserts super() automatically if you do not, so you only write it to pass arguments.'],
    ['Why should fields be private?', 'Getters and setters feel like extra code.', 'Encapsulation: you can validate values, change the internal representation later and keep invariants without breaking callers.'],
    ['equals() vs == for strings', 'My string comparison fails with == even though the text is the same.', '== compares references; equals() compares contents. Always use equals() for strings.'],
    ['What is the diamond problem?', 'Why does Java not allow multiple inheritance of classes?', 'If two parents define the same method, the child cannot tell which to inherit. Java avoids this for classes; default methods in interfaces must be resolved explicitly.'],
  ],
  MA201: [
    ['How do I pick the particular integral form?', 'For y\'\' + y = sin x my guess A sin x fails.', 'sin x already solves the homogeneous equation, so multiply the trial by x: try x(A sin x + B cos x).'],
    ['What does divergence mean physically?', 'I can compute ∇·F but what does it represent?', 'It is the net outflow per unit volume at a point — positive means a source, negative means a sink.'],
    ['Laplace transform of a shifted step function', 'How do I handle u(t − a) f(t − a)?', 'Use the second shifting theorem: L{u(t−a) f(t−a)} = e^(−as) F(s).'],
    ['When is a vector field conservative?', 'Is curl F = 0 always enough?', 'On a simply connected region, yes. Then F is the gradient of some potential function.'],
  ],
  CS202: [
    ['How do I negate a statement with quantifiers?', 'Negating "for all x there exists y" confuses me.', 'Flip each quantifier and negate the predicate: ¬∀x∃y P(x,y) ≡ ∃x∀y ¬P(x,y).'],
    ['Strong induction vs ordinary induction?', 'When do I need strong induction?', 'When proving P(n+1) needs more than just P(n) — for example, recurrences that depend on several earlier terms.'],
    ['Is every equivalence relation a partial order?', 'Both are reflexive and transitive.', 'No. Equivalence relations are symmetric; partial orders are antisymmetric. Only equality is both.'],
    ['How do I count with repetition allowed?', 'Choosing 5 sweets from 3 kinds — which formula?', 'Stars and bars: C(n + r − 1, r) = C(7, 5) = 21.'],
    ['Euler path vs Euler circuit', 'How do I check quickly?', 'Circuit: every vertex has even degree. Path: exactly two vertices have odd degree. The graph must be connected in both cases.'],
  ],
  CS301: [
    ['What is the difference between 3NF and BCNF?', 'Both remove dependencies — where do they differ?', 'BCNF requires every determinant to be a candidate key. 3NF also allows the dependent attribute to be part of a key.'],
    ['When should I use a LEFT JOIN?', 'My INNER JOIN drops customers with no orders.', 'Use LEFT JOIN to keep every row from the left table even when nothing matches; unmatched columns come back as NULL.'],
    ['Why do we need transactions?', 'Can\'t we just run the queries one by one?', 'Transactions make a group of changes atomic, so a crash halfway never leaves money debited but not credited.'],
    ['WHERE vs HAVING', 'Both filter rows — what is the difference?', 'WHERE filters rows before grouping; HAVING filters groups after aggregation.'],
  ],
  CS303: [
    ['What is the difference between a process and a thread?', 'Both run code concurrently.', 'A process has its own address space; threads share their process\'s memory, which makes them cheaper but needs synchronisation.'],
    ['What is thrashing?', 'Why does adding more processes make the system slower?', 'When processes do not have enough frames, they page fault constantly and spend more time swapping than executing.'],
    ['How does the banker\'s algorithm avoid deadlock?', 'Is it the same as deadlock detection?', 'No — it grants a request only if the system stays in a safe state, so deadlock can never occur.'],
    ['Internal vs external fragmentation', 'Which one does paging solve?', 'Paging removes external fragmentation but can waste space inside the last page (internal fragmentation).'],
  ],
  CS304: [
    ['How does TCP handle packet loss?', 'What happens when a segment is dropped?', 'The sender detects loss via timeout or three duplicate ACKs and retransmits, then reduces its congestion window.'],
    ['Why is the subnet mask needed?', 'Can\'t the router just read the IP address?', 'The mask tells hosts and routers which part of the address is the network and which is the host.'],
    ['TCP vs UDP for video calls', 'Why do video apps use UDP?', 'A late packet is useless for live video. UDP avoids retransmission delays, and the app tolerates small losses.'],
    ['What does ARP do?', 'Why do we need MAC addresses if we have IP?', 'ARP maps an IP address to the MAC address needed to deliver the frame on the local network.'],
  ],
  EC301: [
    ['Is the Fourier transform of a periodic signal always discrete?', 'I get impulses in the spectrum.', 'Yes — a periodic signal has a discrete spectrum: impulses at multiples of its fundamental frequency.'],
    ['How do I check if a system is LTI?', 'Which tests do I apply?', 'Check linearity (superposition) and time invariance (a shifted input gives an equally shifted output) separately.'],
    ['What is the ROC of a Laplace transform?', 'Why does it matter?', 'The region of convergence determines which time signal a transform belongs to, and it tells you causality and stability.'],
    ['Why is convolution flipped?', 'Why do we reverse h(τ)?', 'The output at time t sums past inputs weighted by how long ago they occurred, which is h(t − τ).'],
  ],
  EC302: [
    ['How do I minimise a 5-variable K-map?', 'The map does not fit in 2D.', 'Use two 4-variable maps for E = 0 and E = 1 and group across them in mirrored positions.'],
    ['Latch vs flip-flop', 'They both store one bit.', 'A latch is level-triggered; a flip-flop is edge-triggered, which avoids races in synchronous circuits.'],
    ['Can a Moore machine have fewer states than a Mealy machine?', 'Which one is smaller?', 'Usually Mealy needs the same or fewer states, because outputs depend on inputs too.'],
    ['What is a race-around condition?', 'Why does it occur in JK flip-flops?', 'With J = K = 1 and a long clock pulse, the output toggles repeatedly. Master-slave or edge-triggered designs fix it.'],
  ],
  EC303: [
    ['What does the ALE pin do on the 8085?', 'Why is it needed?', 'ALE signals that AD0–AD7 carry the low address byte, so an external latch can hold it before the bus switches to data.'],
    ['Difference between memory-mapped and I/O-mapped I/O', 'Which is better?', 'Memory-mapped I/O uses memory instructions and addresses; I/O-mapped uses IN/OUT with a separate 8-bit address space.'],
    ['How does the stack work in the 8085?', 'Why does SP decrease on PUSH?', 'The stack grows downward: PUSH decrements SP and stores the register pair; POP does the reverse.'],
    ['What is segmentation in the 8086?', 'Why not just use 20-bit registers?', 'With 16-bit registers, physical address = segment × 16 + offset reaches 1 MB of memory.'],
  ],
};
const genericDoubts = (title: string): D[] => [
  [`Best way to revise ${title} for exams?`, 'Which topics should I focus on first?', 'Start with the lecture summaries and past quiz questions, then attempt the practice sets.'],
  [`Recommended reference books for ${title}?`, 'The notes are good but I want more examples.', 'The textbook listed in the course outline has worked examples at the end of every chapter.'],
];

const THREADS = (title: string, code: string) => [
  { title: `Study group for ${code}`, body: `Anyone interested in a weekly study group for ${title}? We could meet in the library on Saturdays.`, faculty: false,
    posts: ['Count me in!', 'Saturday mornings work for me.', 'Can we also do an online session for those who live far away?'] },
  { title: `${title}: useful resources`, body: 'Please share any videos, articles or practice sites that helped you with this course.', faculty: true,
    posts: ['The lecture slides plus the practice set were enough for me.', 'I found the textbook\'s solved examples very helpful.', 'Thanks for the list, sir!'] },
  { title: `Doubt-clearing session before the exam`, body: 'I will hold an open session before the exam. Post the topics you want covered here.', faculty: true,
    posts: ['Please cover the last unit — it was rushed.', 'Could we go through last year\'s paper?'] },
];

// Weekly timetable for current offerings: [day (1 = Mon), start, end, kind, room].
type S = [number, string, string, SlotKind, string];
const P1 = ['09:00', '10:00'] as const, P2 = ['10:00', '11:00'] as const, P3 = ['11:15', '12:15'] as const, P4 = ['12:15', '13:15'] as const, LAB = ['14:00', '16:00'] as const;
const TIMETABLE: Record<string, S[]> = {
  CS301: [[1, ...P1, 'LECTURE', 'CR-201'], [3, ...P2, 'LECTURE', 'CR-201'], [2, ...P3, 'LECTURE', 'CR-201'], [2, ...LAB, 'LAB', 'CS Lab 1'], [5, ...P2, 'TUTORIAL', 'CR-202']],
  CS303: [[1, ...P2, 'LECTURE', 'CR-201'], [2, ...P1, 'LECTURE', 'CR-201'], [3, ...P3, 'LECTURE', 'CR-201'], [4, ...LAB, 'LAB', 'CS Lab 2'], [5, ...P1, 'TUTORIAL', 'CR-202']],
  CS304: [[1, ...P3, 'LECTURE', 'CR-201'], [2, ...P2, 'LECTURE', 'CR-201'], [3, ...P1, 'LECTURE', 'CR-201'], [5, ...LAB, 'LAB', 'CS Lab 1'], [4, ...P2, 'TUTORIAL', 'CR-202']],
  EC301: [[1, ...P1, 'LECTURE', 'CR-305'], [2, ...P3, 'LECTURE', 'CR-305'], [3, ...P2, 'LECTURE', 'CR-305'], [4, ...LAB, 'LAB', 'ECE Lab 1'], [5, ...P1, 'TUTORIAL', 'CR-306']],
  EC302: [[1, ...P2, 'LECTURE', 'CR-305'], [2, ...P1, 'LECTURE', 'CR-305'], [3, ...P3, 'LECTURE', 'CR-305'], [3, ...LAB, 'LAB', 'ECE Lab 2'], [5, ...P2, 'TUTORIAL', 'CR-306']],
  EC303: [[1, ...P4, 'LECTURE', 'CR-305'], [2, ...P2, 'LECTURE', 'CR-305'], [3, ...P1, 'LECTURE', 'CR-305'], [5, ...P3, 'LAB', 'ECE Lab 1'], [4, ...P3, 'TUTORIAL', 'CR-306']],
};

// Academic calendar, aligned with the seeded semesters (Sem 1: Jul–Dec 2025, Sem 2: Jan–May 2026, Sem 3: Jul–Dec 2026),
// the exam-fee announcement (due 5 Dec, exams from 8 Dec) and the result publication dates. Semester start/end come from the API.
type Ev = [type: CalendarEventType, title: string, start: string, end?: string, description?: string];
const CALENDAR: Ev[] = [
  // Semester 1 · 2025
  ['HOLIDAY', 'Independence Day', '2025-08-15'],
  ['EXAM', 'Mid-semester examinations', '2025-09-22', '2025-09-27', 'Semester 1 mid-semester exams. Timetable on the notice board.'],
  ['HOLIDAY', 'Gandhi Jayanti / Dussehra', '2025-10-02'],
  ['BREAK', 'Diwali break', '2025-10-18', '2025-10-23'],
  ['EXAM', 'End-semester examinations', '2025-12-08', '2025-12-18', 'Semester 1 theory examinations.'],
  ['BREAK', 'Winter break', '2025-12-21', '2026-01-04'],
  // Semester 2 · 2026
  ['ACADEMIC', 'Semester 1 results declared', '2026-01-10'],
  ['HOLIDAY', 'Republic Day', '2026-01-26'],
  ['EVENT', 'Annual sports meet', '2026-02-12', '2026-02-14', 'Inter-department athletics, cricket and football. Classes suspended in the afternoons.'],
  ['HOLIDAY', 'Holi', '2026-03-04'],
  ['EXAM', 'Mid-semester examinations', '2026-03-09', '2026-03-14', 'Semester 2 mid-semester exams.'],
  ['HOLIDAY', 'Id-ul-Fitr', '2026-03-21'],
  ['HOLIDAY', 'Good Friday', '2026-04-03'],
  ['HOLIDAY', 'Dr. Ambedkar Jayanti', '2026-04-14'],
  ['EXAM', 'End-semester examinations', '2026-05-18', '2026-05-28', 'Semester 2 theory and practical examinations.'],
  ['BREAK', 'Summer vacation', '2026-06-01', '2026-07-14'],
  ['ACADEMIC', 'Semester 2 results declared', '2026-06-20'],
  // Semester 3 · 2026 (current)
  ['ACADEMIC', 'Orientation for returning students', '2026-07-15', '2026-07-16', 'Course registration help desk and timetable walkthrough in the main auditorium.'],
  ['DEADLINE', 'Last date to add or drop courses', '2026-07-31'],
  ['HOLIDAY', 'Independence Day', '2026-08-15'],
  ['DEADLINE', 'Semester fee due', '2026-08-20', undefined, 'Pay at the accounts office or online to avoid a late fee.'],
  ['HOLIDAY', 'Janmashtami', '2026-09-04'],
  ['HOLIDAY', 'Ganesh Chaturthi', '2026-09-14'],
  ['EXAM', 'Mid-semester examinations', '2026-09-21', '2026-09-26', 'Semester 3 mid-semester exams. Regular classes are suspended.'],
  ['HOLIDAY', 'Gandhi Jayanti', '2026-10-02'],
  ['EVENT', 'Parent–teacher meeting', '2026-10-10', undefined, 'Mid-semester progress review with faculty advisers, 10 am – 1 pm.'],
  ['EVENT', 'TechFest 2026', '2026-10-16', '2026-10-17', 'Annual technical festival: hackathon, project expo and robotics challenge.'],
  ['HOLIDAY', 'Dussehra', '2026-10-20'],
  ['BREAK', 'Diwali break', '2026-11-07', '2026-11-11'],
  ['HOLIDAY', 'Guru Nanak Jayanti', '2026-11-24'],
  ['DEADLINE', 'Attendance shortage list published', '2026-11-28', undefined, 'Students below 75% attendance must meet their HOD before 2 December.'],
  ['EXAM', 'Practical examinations', '2026-11-30', '2026-12-04', 'Lab exams for CS and ECE courses, as per the department schedule.'],
  ['DEADLINE', 'Last date for exam fee', '2026-12-05'],
  ['DEADLINE', 'Semester 4 course registration', '2026-12-01', '2026-12-10'],
  ['EXAM', 'End-semester examinations', '2026-12-08', '2026-12-18', 'Semester 3 theory examinations. Hall tickets from 3 December.'],
  ['BREAK', 'Winter break', '2026-12-21', '2027-01-04'],
  ['HOLIDAY', 'Christmas', '2026-12-25'],
  // Semester 4 · 2027 (planned)
  ['ACADEMIC', 'Semester 4 classes begin', '2027-01-05'],
  ['ACADEMIC', 'Semester 3 results declared', '2027-01-20'],
  ['HOLIDAY', 'Republic Day', '2027-01-26'],
];

const markStatus =(): AttendanceStatus => { const x = rnd(); return x < 0.8 ? 'PRESENT' : x < 0.88 ? 'LATE' : x < 0.92 ? 'EXCUSED' : 'ABSENT'; };

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to load demo data in production');
  const offerings = await prisma.courseOffering.findMany({
    where: { enrollments: { some: { status: 'ACTIVE' } } },
    include: {
      course: { select: { code: true, title: true } }, semester: { select: { startDate: true, endDate: true } },
      instructors: { select: { facultyId: true } }, enrollments: { where: { status: 'ACTIVE' }, select: { studentId: true } },
      _count: { select: { classSessions: true } },
    },
  });

  for (const o of offerings) {
    const { code, title } = o.course;
    const faculty = o.instructors[0]?.facultyId;
    const students = o.enrollments.map((e) => e.studentId);
    if (!faculty) { console.log(`${code}: no instructor — skipped`); continue; }
    // Activity window: the semester for past offerings, the last 10 weeks for current ones.
    const end = new Date(Math.min(o.semester.endDate.getTime(), NOW - DAY));
    const start = new Date(Math.max(o.semester.startDate.getTime(), end.getTime() - 70 * DAY));
    let sessions = 0, doubts = 0, threads = 0;

    // ── Attendance: weekly lectures with every enrolled student marked ──
    if (o._count.classSessions === 0) {
      const weeks = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (7 * DAY)));
      for (let w = 0; w < weeks; w++) {
        const s0 = new Date(start.getTime() + w * 7 * DAY + int(0, 2) * DAY); s0.setHours(10, 0, 0, 0);
        const s = await prisma.classSession.create({ data: { offeringId: o.id, title: `${title} — Lecture ${w + 1}`, startsAt: s0, endsAt: new Date(s0.getTime() + 3600000) } });
        await prisma.attendanceRecord.createMany({ data: students.map((studentId) => ({ sessionId: s.id, studentId, markedById: faculty, status: markStatus() })) });
        sessions++;
      }
      if (o.status === 'PUBLISHED') for (const d of [2, 6]) {
        const s0 = new Date(NOW + d * DAY); s0.setHours(10, 0, 0, 0);
        await prisma.classSession.create({ data: { offeringId: o.id, title: `${title} — Upcoming lecture`, startsAt: s0, endsAt: new Date(s0.getTime() + 3600000), meetingUrl: `https://meet.example.com/${o.id.slice(0, 8)}` } });
      }
    }

    // ── Doubts: anonymous questions with faculty answers, votes and the odd student reply ──
    const have = new Set((await prisma.doubt.findMany({ where: { offeringId: o.id }, select: { title: true } })).map((d) => d.title));
    for (const [i, [dTitle, body, answer]] of (DOUBTS[code] ?? genericDoubts(title)).entries()) {
      if (have.has(dTitle)) continue;
      const createdAt = between(start, end);
      const status: DoubtStatus = o.status === 'ARCHIVED' ? (i % 3 === 0 ? 'ANSWERED' : 'RESOLVED') : (['OPEN', 'ANSWERED', 'RESOLVED', 'OPEN', 'ANSWERED'] as const)[i % 5];
      const author = pick(students);
      const voters = sample(students.filter((s) => s !== author), int(0, Math.min(12, students.length - 1)));
      const d = await prisma.doubt.create({ data: { offeringId: o.id, authorId: author, title: dTitle, body, status, voteCount: voters.length, isPinned: i === 0 && voters.length > 6, createdAt } });
      if (voters.length) await prisma.doubtVote.createMany({ data: voters.map((studentId) => ({ doubtId: d.id, studentId, createdAt: later(createdAt, 1, 72) })) });
      if (rnd() < 0.5) await prisma.doubtReply.create({ data: { doubtId: d.id, authorId: pick(students), body: 'I had the same question — following this.', createdAt: later(createdAt, 1, 12) } });
      if (status !== 'OPEN') await prisma.doubtReply.create({ data: { doubtId: d.id, authorId: faculty, isFaculty: true, isUseful: status === 'RESOLVED', body: answer, createdAt: later(createdAt, 12, 48) } });
      doubts++;
    }

    // ── Discussions: named threads with replies ──
    const haveT = new Set((await prisma.discussionThread.findMany({ where: { offeringId: o.id }, select: { title: true } })).map((t) => t.title));
    for (const t of THREADS(title, code)) {
      if (haveT.has(t.title)) continue;
      const createdAt = between(start, end);
      await prisma.discussionThread.create({ data: {
        offeringId: o.id, authorId: t.faculty ? faculty : pick(students), title: t.title, body: t.body, createdAt,
        posts: { create: t.posts.map((body, k) => ({ authorId: pick(students), body, createdAt: later(createdAt, 2 + k * 6, 8 + k * 12) })) },
      } });
      threads++;
    }
    console.log(`${code}: +${sessions} sessions, +${doubts} doubts, +${threads} threads`);
  }

  // ── Timetable: only for live offerings that have none yet; every slot is checked with the same clash rules as the API ──
  const live = await prisma.courseOffering.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { id: true, sectionId: true, semesterId: true, course: { select: { code: true } }, instructors: { select: { facultyId: true } }, timetableSlots: true },
  });
  const booked: Ctx[] = live.flatMap((o) => o.timetableSlots.map((t) => ({ ...t, sectionId: o.sectionId, semesterId: o.semesterId, facultyIds: o.instructors.map((i) => i.facultyId), label: o.course.code })));
  for (const o of live) {
    const plan = TIMETABLE[o.course.code];
    if (!plan || o.timetableSlots.length) continue;
    for (const [dayOfWeek, startTime, endTime, kind, room] of plan) {
      const slot: Ctx = { dayOfWeek, startTime, endTime, room, sectionId: o.sectionId, semesterId: o.semesterId, facultyIds: o.instructors.map((i) => i.facultyId), label: o.course.code };
      const clash = findClash(slot, booked);
      if (clash) throw new Error(`${o.course.code} day ${dayOfWeek} ${startTime}: ${clash}`);
      await prisma.timetableSlot.create({ data: { offeringId: o.id, dayOfWeek, startTime, endTime, room, kind } });
      booked.push(slot);
    }
    console.log(`${o.course.code}: +${plan.length} timetable slots`);
  }

  // ── Academic calendar: matched by title + start date ──
  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: 'COLLEGE_ADMIN' } } }, select: { id: true } });
  const haveE = new Set((await prisma.academicEvent.findMany({ select: { title: true, startDate: true } })).map((e) => `${e.title}|${e.startDate.toISOString().slice(0, 10)}`));
  const newEvents = CALENDAR.filter(([, title, start]) => !haveE.has(`${title}|${start}`));
  await prisma.academicEvent.createMany({ data: newEvents.map(([type, title, start, end, description]) => ({
    type, title, description, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end ?? start}T00:00:00Z`), createdById: admin?.id,
  })) });
  console.log(`Calendar: +${newEvents.length} events`);

  // ── Direct messages: a few realistic threads, each only if that pair has never talked ──
  const user = (email: string) => prisma.user.findUnique({ where: { email: `${email}@northbridge.test` }, select: { id: true } });
  const link = await prisma.parentStudentLink.findFirst({ where: { status: 'ACTIVE' }, select: { parentId: true, studentId: true } });
  const childFaculty = link && await prisma.instructorAssignment.findFirst({ where: { offering: { status: 'PUBLISHED', enrollments: { some: { studentId: link.studentId, status: 'ACTIVE' } } } }, select: { facultyId: true } });
  const [fac2, stu3] = await Promise.all([user('faculty2'), user('student3')]);
  type Line = [fromA: boolean, body: string, hoursAgo: number];
  const threads: [string | undefined, string | undefined, Line[]][] = [
    [link?.parentId, childFaculty?.facultyId, [
      [true, 'Good evening. My child mentioned the mid-semester marks are out — could you tell me how they did in your course?', 52],
      [false, 'Good evening! They scored well above the class average. The only weak area was the last unit; the daily revision quizzes will help.', 49],
      [true, 'Thank you, that is reassuring. We will make sure the revision is done every day.', 48],
    ]],
    [admin?.id, fac2?.id, [
      [true, 'Hi, the end-semester question papers need to reach the exam cell by 1 December. Will that work for your courses?', 30],
      [false, 'Yes, both papers are ready. I will submit them on Monday.', 28],
    ]],
    [stu3?.id, admin?.id, [
      [true, 'Hello, I paid the exam fee by UPI yesterday but it still shows as pending. Can you check?', 6],
      [false, 'Thanks for flagging this. UPI payments are reconciled within one working day — it should update by tomorrow.', 5],
      [true, 'Okay, thank you!', 5],
    ]],
  ];
  let convs = 0;
  for (const [a, b, lines] of threads) {
    if (!a || !b || a === b) continue;
    const key = a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
    if (await prisma.conversation.findUnique({ where: { userAId_userBId: key } })) continue;
    const at = (h: number) => new Date(NOW - h * 3600000);
    const last = at(lines[lines.length - 1][2]);
    // Both sides have read everything except the final message, which stays unread for its recipient.
    const lastFromA = lines[lines.length - 1][0];
    const aIsFirst = key.userAId === a;
    await prisma.conversation.create({ data: {
      ...key, lastMessageAt: last, createdAt: at(lines[0][2]),
      aReadAt: (lastFromA === aIsFirst) ? last : at(lines[lines.length - 1][2] + 1),
      bReadAt: (lastFromA !== aIsFirst) ? last : at(lines[lines.length - 1][2] + 1),
      messages: { create: lines.map(([fromA, body, h]) => ({ senderId: fromA ? a : b, body, createdAt: at(h) })) },
    } });
    convs++;
  }
  console.log(`Messages: +${convs} conversations`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
