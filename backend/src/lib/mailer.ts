import { isProd } from '../config/env';

// shortcut: dev mailer logs to the console; plug SMTP/SES in here before production use.
export async function sendMail(to: string, subject: string, text: string) {
  if (isProd) throw new Error('No mail transport configured');
  if (process.env.NODE_ENV !== 'test') console.log(`\n[mail] to=${to} subject="${subject}"\n${text}\n`);
}
