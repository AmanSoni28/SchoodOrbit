import { Printer, ReceiptText } from 'lucide-react';
import { useGet } from '../lib/hooks';
import { useBranding } from '../lib/branding';
import { fmtDateTime, money, titleCase } from '../lib/format';
import { Button, LoadingBlock, Modal, StatusBadge } from './ui';

/** Printable payment receipt. Visible to admins and to the student who paid (enforced by the API). */
export function ReceiptModal({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const q = useGet<any>(paymentId ? `/fees/payments/${paymentId}` : null);
  const b = useBranding();
  const r = q.data;
  return (
    <Modal open={!!paymentId} onClose={onClose} title="Payment receipt">
      {!r ? <LoadingBlock rows={3} /> : (
        <>
          <div className="print-area overflow-hidden rounded-2xl border border-line">
            <div className="flex items-center justify-between bg-gradient-to-r from-navy to-primary p-5 text-white">
              <div><div className="text-lg font-bold">{b.name}</div><div className="text-xs text-white/70">Fee payment receipt</div></div>
              <ReceiptText className="size-8 text-accent" aria-hidden />
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-dashed border-line pb-4">
                <div><div className="text-xs text-muted">Amount received</div><div className="text-3xl font-bold text-success">{money(r.amount)}</div></div>
                <div className="text-right text-xs text-muted"><div className="font-mono text-sm font-semibold text-navy">{r.receiptNo}</div>{fmtDateTime(r.paidAt)}</div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-xs text-muted">Student</dt><dd className="font-medium">{r.student.firstName} {r.student.lastName}</dd><dd className="text-xs text-muted">{r.student.email}</dd></div>
                <div><dt className="text-xs text-muted">Fee</dt><dd className="font-medium">{r.fee.name}</dd></div>
                <div><dt className="text-xs text-muted">Method</dt><dd className="font-medium">{titleCase(r.method)}{r.reference ? ` · ${r.reference}` : ''}</dd></div>
                <div><dt className="text-xs text-muted">Recorded by</dt><dd className="font-medium">{r.recordedBy.firstName} {r.recordedBy.lastName}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-cloud p-3 text-center text-sm">
                <div><div className="text-[11px] text-muted">Fee total</div><div className="font-semibold">{money(r.fee.net)}</div></div>
                <div><div className="text-[11px] text-muted">Paid to date</div><div className="font-semibold">{money(r.fee.paid)}</div></div>
                <div><div className="text-[11px] text-muted">Balance</div><div className="font-semibold">{money(r.fee.balance)}</div></div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted"><span>Status</span><StatusBadge status={r.fee.status} /></div>
              {r.note && <p className="mt-3 text-xs text-muted">Note: {r.note}</p>}
            </div>
          </div>
          <div className="no-print mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => window.print()}><Printer className="size-4" aria-hidden />Print</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
