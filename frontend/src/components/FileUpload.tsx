import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { uploadFile } from '../lib/api';
import { bytes } from '../lib/format';
import { Button, useToast } from './ui';

// Matches the server's upload limit: 20 MB normally, 4 MB on Vercel (set at build time in vercel.json).
export const MAX_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 20;

export type Uploaded = { id: string; originalName: string; mimeType: string; size: number };

/** Uploads immediately to /files and reports the stored file ids. */
export function FileUpload({ value, onChange, accept, max = 5, label = 'Attach files' }: { value: Uploaded[]; onChange: (f: Uploaded[]) => void; accept?: string; max?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out = [...value];
      for (const f of Array.from(files).slice(0, max - value.length)) {
        if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name} is larger than ${MAX_MB} MB`); continue; }
        out.push(await uploadFile(f));
      }
      onChange(out);
    } catch (e) { toast.error(e); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" className="hidden" accept={accept} multiple={max > 1} onChange={(e) => pick(e.target.files)} aria-label={label} />
      <Button type="button" variant="secondary" size="sm" loading={busy} disabled={value.length >= max} onClick={() => ref.current?.click()}><Paperclip className="size-4" aria-hidden />{busy ? 'Uploading…' : label}</Button>
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-cloud px-3 py-1.5 text-sm">
              <span className="truncate">{f.originalName} <span className="text-muted">({bytes(f.size)})</span></span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.originalName}`} className="rounded p-1 hover:bg-white"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
