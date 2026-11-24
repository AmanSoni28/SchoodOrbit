import { isProd } from '../config/env';

// shortcut: no mail transport yet. Dev logs the message; production only records that an email was skipped
// (never its body — it can contain reset tokens). Plug SMTP/SES in here to deliver real email.
export async function sendMail(to: string, subject: string, text: string) {
  if (isProd) { console.warn(`[mail] not sent (no transport configured): subject="${subject}"`); return; }
  if (process.env.NODE_ENV !== 'test') console.log(`\n[mail] to=${to} subject="${subject}"\n${text}\n`);
}
