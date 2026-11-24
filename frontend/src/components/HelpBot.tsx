import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, MessageCircleQuestion, RotateCcw, Send, X } from 'lucide-react';
import type { Role } from '../lib/auth';
import { featureOn, useBranding } from '../lib/branding';
import { cx } from './ui';

// shortcut: keyword-matched FAQ, no AI; upgrade to an LLM endpoint if users ask open-ended questions.
type Faq = { q: string; keys: string[]; a: string; to?: string; link?: string; roles?: Role[]; feature?: string };

const ADMINS: Role[] = ['SUPER_ADMIN', 'COLLEGE_ADMIN'];
const FAQS: Faq[] = [
  { q: 'How do I change my password?', keys: ['password', 'change', 'reset', 'forgot'], a: 'Open Account & security and use "Change password". If you are signed out, use "Forgot password" on the login page.', to: '/account', link: 'Account & security' },
  { q: 'How do I turn on two-factor authentication?', keys: ['2fa', 'mfa', 'two', 'factor', 'authenticator', 'otp', 'security'], a: 'Go to Account & security and enable two-factor authentication. Scan the QR code with an authenticator app and enter the 6-digit code.', to: '/account', link: 'Account & security' },
  { q: 'Where are my notifications?', keys: ['notification', 'notifications', 'alert', 'bell', 'unread'], a: 'Click the bell icon at the top right, or open Notifications in the menu.', to: '/notifications', link: 'Notifications' },
  { q: 'Where are my courses?', keys: ['course', 'courses', 'class', 'subject', 'lesson', 'material'], a: 'Open My courses to see every course you are enrolled in or teaching, with lessons, assignments and quizzes.', to: '/courses', link: 'My courses', roles: ['STUDENT', 'FACULTY'] },
  { q: 'How do I submit an assignment?', keys: ['assignment', 'submit', 'homework', 'upload', 'deadline'], a: 'Open the course in My courses, go to the Assignments tab, pick the assignment and upload your file before the due date.', to: '/courses', link: 'My courses', roles: ['STUDENT'] },
  { q: 'How do I create an assignment or quiz?', keys: ['create', 'assignment', 'quiz', 'test', 'publish'], a: 'Open the course in My courses, then use the Assignments or Quizzes tab to create and publish one.', to: '/courses', link: 'My courses', roles: ['FACULTY'] },
  { q: 'Where can I see my results?', keys: ['result', 'results', 'grade', 'grades', 'marks', 'score', 'gpa'], a: 'Your published results and grades are on the Results page.', to: '/results', link: 'Results', roles: ['STUDENT'] },
  { q: 'Which topics am I weak in?', keys: ['weak', 'weakness', 'improve', 'path', 'topic', 'topics', 'section', 'focus', 'better'], a: 'My learning path shows your weak courses, sections and topics, and gives step-by-step tips to improve each one.', to: '/learning-path', link: 'My learning path', roles: ['STUDENT'] },
  { q: 'How do I check my attendance?', keys: ['attendance', 'present', 'absent'], a: 'Open a course in My courses and check its Attendance tab for your record.', to: '/courses', link: 'My courses', roles: ['STUDENT', 'FACULTY'] },
  { q: 'How do I pay or view my fees?', keys: ['fee', 'fees', 'pay', 'payment', 'receipt', 'due', 'invoice'], a: 'My fees shows what is due, what you have paid, and lets you download receipts.', to: '/fees', link: 'My fees', roles: ['STUDENT'] },
  { q: 'Where do I get my certificates?', keys: ['certificate', 'certificates', 'download', 'completion'], a: 'Certificates for completed courses are listed on the Certificates page.', to: '/certificates', link: 'Certificates', roles: ['STUDENT'] },
  { q: 'What is daily revision?', keys: ['revision', 'daily', 'streak', 'practice', 'revise'], a: 'Daily revision gives you a short quiz each day on what you have studied. Keep your streak going!', to: '/revision', link: 'Daily revision', roles: ['STUDENT'], feature: 'dailyRevision' },
  { q: 'How does the AI Homework Helper work?', keys: ['ai', 'helper', 'doubt', 'help', 'explain', 'question'], a: 'Start a session for a course and ask your question or attach a photo. It guides you with hints and steps rather than giving the final answer.', to: '/ai-helper', link: 'AI Homework Helper', roles: ['STUDENT'], feature: 'aiHomework' },
  { q: 'Can my parents see my progress?', keys: ['parent', 'parents', 'privacy', 'share', 'guardian'], a: 'You control what linked parents can see from the Parent access page.', to: '/privacy', link: 'Parent access', roles: ['STUDENT'], feature: 'parentPortal' },
  { q: "How do I see my child's progress?", keys: ['child', 'progress', 'ward', 'son', 'daughter', 'performance'], a: "Your Progress overview shows your child's attendance, grades and activity.", to: '/', link: 'Progress overview', roles: ['PARENT'] },
  { q: 'How do I change notification settings?', keys: ['settings', 'email', 'notification', 'preferences'], a: 'Choose which updates you receive in Notification settings.', to: '/parent/settings', link: 'Notification settings', roles: ['PARENT'] },
  { q: 'Where are announcements?', keys: ['announcement', 'announcements', 'news', 'notice'], a: 'All college and course announcements are on the Announcements page.', to: '/announcements', link: 'Announcements', roles: ['STUDENT', 'FACULTY', 'COLLEGE_ADMIN'] },
  { q: 'How do I add users?', keys: ['user', 'users', 'add', 'student', 'faculty', 'invite', 'import', 'account'], a: 'Open Users to create accounts one by one or import them in bulk.', to: '/admin/users', link: 'Users', roles: ADMINS },
  { q: 'How do I set up courses and offerings?', keys: ['course', 'offering', 'catalogue', 'enroll', 'semester', 'section'], a: 'Add courses in the Course catalogue, then create Course offerings to assign faculty and enroll students for a term.', to: '/admin/offerings', link: 'Course offerings', roles: ['COLLEGE_ADMIN'] },
  { q: 'How do I manage fees?', keys: ['fee', 'fees', 'payment', 'collect', 'finance'], a: 'Fees & payments lets you create fee structures, record payments and issue receipts.', to: '/admin/fees', link: 'Fees & payments', roles: ['COLLEGE_ADMIN'] },
  { q: 'How do I change branding or features?', keys: ['brand', 'branding', 'logo', 'color', 'feature', 'settings'], a: 'Branding & features controls the college name, logo, colours and which modules are switched on.', to: '/admin/settings', link: 'Branding & features', roles: ['SUPER_ADMIN'] },
  { q: 'Who do I contact for other problems?', keys: ['contact', 'support', 'problem', 'issue', 'admin', 'error', 'bug'], a: 'Please contact your college administrator or the IT help desk. Students can also ask their faculty.' },
];

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Best FAQ for a question: most keyword hits, ties broken by list order. */
export function matchFaq(text: string, faqs: Faq[]): Faq | undefined {
  const w = new Set(words(text));
  let best: Faq | undefined; let top = 0;
  for (const f of faqs) {
    const hits = f.keys.filter((k) => w.has(k) || w.has(k + 's')).length;
    if (hits > top) { top = hits; best = f; }
  }
  return best;
}

type Msg = { from: 'bot' | 'me'; text: string; to?: string; link?: string };

export function HelpBot({ role, name }: { role: Role | null; name?: string }) {
  const b = useBranding();
  const faqs = FAQS.filter((f) => (!f.roles || (role && f.roles.includes(role))) && (!f.feature || featureOn(b, f.feature)));
  const greeting: Msg = { from: 'bot', text: `Hi${name ? ` ${name}` : ''}! I can answer basic questions about using the portal. Pick one below or type your own.` };
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([greeting]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => setMsgs([greeting]), [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const f = matchFaq(q, faqs);
    setMsgs((m) => [...m, { from: 'me', text: q },
      f ? { from: 'bot', text: f.a, to: f.to, link: f.link }
        : { from: 'bot', text: "Sorry, I don't know that one yet. Try one of the suggested questions, or contact your college administrator." }]);
    setText('');
  };

  return (
    <>
      {open && (
        <div role="dialog" aria-label="Help assistant" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className={cx('fixed bottom-24 right-4 sm:right-6 z-40 flex h-[min(32rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl')}>
          <div className="flex items-center gap-3 bg-gradient-to-r from-navy to-navy-2 px-4 py-3 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-accent to-primary"><Bot className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Help assistant</span><span className="block text-xs text-white/60">Answers to common questions</span></span>
            <button onClick={() => setMsgs([greeting])} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Restart conversation" title="Restart"><RotateCcw className="size-4" /></button>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close help assistant"><X className="size-4" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-cloud p-4" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.from === 'me' ? 'ml-auto rounded-br-sm bg-primary text-white' : 'rounded-bl-sm bg-white text-ink shadow-sm')}>
                {m.text}
                {m.to && <Link to={m.to} onClick={() => setOpen(false)} className="mt-1.5 block font-medium text-primary hover:underline">Go to {m.link} →</Link>}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {faqs.slice(0, 6).map((f) => (
                <button key={f.q} onClick={() => ask(f.q)} className="rounded-full border border-primary/30 bg-white px-2.5 py-1 text-xs text-primary hover:bg-primary/5">{f.q}</button>
              ))}
            </div>
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex gap-2 border-t border-line p-3">
            <label htmlFor="helpbot-input" className="sr-only">Type your question</label>
            <input id="helpbot-input" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Type your question…" autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary" />
            <button type="submit" disabled={!text.trim()} className="grid size-9 place-items-center rounded-xl bg-primary text-white disabled:opacity-40" aria-label="Send"><Send className="size-4" /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close help assistant' : 'Open help assistant'}
        className={cx('fixed bottom-6 right-4 sm:right-6 z-40 grid size-14 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-xl shadow-primary/30 transition hover:scale-105')}>
        {open ? <X className="size-6" aria-hidden /> : <MessageCircleQuestion className="size-6" aria-hidden />}
      </button>
    </>
  );
}
