import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Archive, ArrowLeft, Copy, KeyRound, Lock, Mail, Phone, Search, Send, UserCheck, UserX } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { fmtDate, fmtDateTime, relativeTime } from '../../lib/format';
import type { EnquiryStatus } from '../../lib/types';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, ConfirmDialog, EmptyState, Modal, PageLoader, Select, StatusBadge, Textarea, useToast } from '../../components/ui';

// ═════════════ Enquiries ═════════════

interface EnquiryRow {
  id: string;
  reference: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  serviceLabel: string | null;
  status: EnquiryStatus;
  awaitingReply: boolean;
  isGuest: boolean;
  archived: boolean;
  messageCount: number;
  attachmentCount: number;
  createdAt: string;
  lastActivityAt: string;
}
interface EnquiryFull extends Omit<EnquiryRow, 'isGuest' | 'messageCount' | 'attachmentCount'> {
  customer: { id: string; name: string; email: string; phone: string | null } | null;
  relatedWork: { id: string; slug: string; title: string; status: string } | null;
  messages: { id: string; authorType: 'CUSTOMER' | 'ADMIN'; body: string; createdAt: string }[];
  notes: { id: string; body: string; author: string; createdAt: string }[];
  attachments: { id: string; url: string; thumbUrl: string }[];
}

export function AdminEnquiries() {
  useDocumentTitle('Enquiries');
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const status = params.get('status') ?? 'all';
  const archived = params.get('archived') === 'true';
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'enquiries', status, archived, dq],
    queryFn: () => api.get<{ items: EnquiryRow[]; total: number }>(`/admin/enquiries?status=${status}&archived=${archived}${dq ? `&q=${encodeURIComponent(dq)}` : ''}&limit=100`),
  });
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };
  if (openId) return <EnquiryDetail id={openId} onBack={() => set('id', null)} />;
  return (
    <>
      <AdminPageHeader title="Enquiries" subtitle="Read, reply and keep private notes. Customers only ever see replies — never notes." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="flex flex-wrap gap-1.5">
          {[
            ['all', 'All'],
            ['awaiting', 'Awaiting reply'],
            ['NEW', 'New'],
            ['UNDER_REVIEW', 'Under review'],
            ['RESPONDED', 'Responded'],
            ['CLOSED', 'Closed'],
          ].map(([v, l]) => (
            <button key={v} onClick={() => set('status', v === 'all' ? null : v)} className={clsx('rounded-full border px-3 py-1.5 text-[12px] font-semibold', status === v ? 'border-rose bg-rose text-white' : 'border-beige bg-ivory')}>
              {l}
            </button>
          ))}
          <button onClick={() => set('archived', archived ? null : 'true')} className={clsx('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold', archived ? 'border-brown bg-brown text-white' : 'border-beige bg-ivory')}>
            <Archive className="h-3.5 w-3.5" /> Archived
          </button>
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" />
          <input aria-label="Search enquiries" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, ref, subject…" className="w-full rounded-md border border-beige bg-ivory py-2 pl-9 pr-3 text-[14px]" />
        </div>
      </div>
      {isLoading ? (
        <PageLoader />
      ) : !data?.items.length ? (
        <EmptyState title="No enquiries here" />
      ) : (
        <ul className="space-y-2">
          {data.items.map((e) => (
            <li key={e.id}>
              <button onClick={() => set('id', e.id)} className={clsx('flex w-full flex-col gap-2 rounded-xl border bg-ivory p-4 text-left transition hover:border-gold sm:flex-row sm:items-center', e.awaitingReply && e.status !== 'CLOSED' ? 'border-rose/40' : 'border-beige')}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {e.awaitingReply && e.status !== 'CLOSED' && <span className="h-2 w-2 shrink-0 rounded-full bg-rose" aria-label="Awaiting reply" />}
                    <span className="truncate">{e.subject}</span>
                  </p>
                  <p className="truncate text-[12.5px] text-plum/75">
                    {e.name} {e.isGuest && '(guest)'} · {e.serviceLabel ?? 'General'} · {e.reference} · {relativeTime(e.lastActivityAt)}
                    {e.attachmentCount > 0 && ` · 📎 ${e.attachmentCount}`}
                  </p>
                </div>
                <StatusBadge status={e.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EnquiryDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'enquiry', id], queryFn: () => api.get<{ enquiry: EnquiryFull }>(`/admin/enquiries/${id}`) });
  const [reply, setReply] = useState('');
  const [closeAfter, setCloseAfter] = useState(false);
  const [note, setNote] = useState('');
  const update = (res: { enquiry: EnquiryFull }) => {
    qc.setQueryData(['admin', 'enquiry', id], res);
    qc.invalidateQueries({ queryKey: ['admin', 'enquiries'] });
    qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };
  const send = useMutation({
    mutationFn: () => api.post<{ enquiry: EnquiryFull; emailed: boolean }>(`/admin/enquiries/${id}/reply`, { message: reply, close: closeAfter }),
    onSuccess: (res) => {
      update(res);
      setReply('');
      toast(res.emailed ? 'Reply sent and emailed' : res.enquiry.customer ? 'Reply sent — visible in the customer’s account' : 'Reply saved (guest has no account and email is not configured — contact them directly)');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const addNote = useMutation({
    mutationFn: () => api.post<{ enquiry: EnquiryFull }>(`/admin/enquiries/${id}/notes`, { note }),
    onSuccess: (res) => {
      update(res);
      setNote('');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const patch = useMutation({
    mutationFn: (body: { status?: EnquiryStatus; archived?: boolean }) => api.patch<{ enquiry: EnquiryFull }>(`/admin/enquiries/${id}`, body),
    onSuccess: (res) => {
      update(res);
      toast('Updated');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  const e = data.enquiry;
  return (
    <>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-plum hover:text-rose-deep">
        <ArrowLeft className="h-4 w-4" /> All enquiries
      </button>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-beige bg-ivory p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-[24px]">{e.subject}</h1>
                <p className="text-[13px] text-plum/70">
                  {e.reference} · {e.serviceLabel ?? 'General'} · received {fmtDateTime(e.createdAt)}
                </p>
              </div>
              <StatusBadge status={e.status} />
            </div>
            {e.relatedWork && (
              <p className="mt-3 text-[13.5px]">
                Related design:{' '}
                <a href={`/recent-work/${e.relatedWork.slug}`} target="_blank" rel="noreferrer" className="text-rose-deep underline">
                  {e.relatedWork.title}
                </a>
                {e.relatedWork.status !== 'PUBLISHED' && ' (unpublished)'}
              </p>
            )}
            {e.attachments.length > 0 && (
              <div className="mt-4">
                <p className="label-caps mb-2 text-plum/60">Reference photos</p>
                <div className="flex flex-wrap gap-2">
                  {e.attachments.map((a, i) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-md ring-1 ring-beige" aria-label={`Open reference photo ${i + 1}`}>
                      <img src={a.thumbUrl} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <ol className="mt-6 space-y-4">
              {e.messages.map((m) => (
                <li key={m.id} className={clsx('flex', m.authorType === 'ADMIN' ? 'justify-end' : 'justify-start')}>
                  <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3', m.authorType === 'ADMIN' ? 'rounded-br-sm bg-rose text-white' : 'rounded-bl-sm border border-beige bg-cream')}>
                    <p className={clsx('mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]', m.authorType === 'ADMIN' ? 'text-white/80' : 'text-gold-dark')}>
                      {m.authorType === 'ADMIN' ? 'You (boutique)' : e.name} · {fmtDateTime(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-line text-[14.5px]">{m.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <form
              className="mt-6 space-y-3 border-t border-beige pt-5"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (reply.trim()) send.mutate();
              }}
            >
              <Textarea label="Reply to customer" rows={4} value={reply} onChange={(ev) => setReply(ev.target.value)} hint={e.customer ? 'The customer sees this in their account.' : 'Guest enquiry — reply directly by phone/email too.'} />
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" loading={send.isPending} disabled={!reply.trim()}>
                  <Send className="h-4 w-4" /> Send reply
                </Button>
                <label className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" className="h-4 w-4 accent-[#B76E82]" checked={closeAfter} onChange={(ev) => setCloseAfter(ev.target.checked)} /> Close after replying
                </label>
              </div>
            </form>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="space-y-2 rounded-xl border border-beige bg-ivory p-5 text-[14px]">
            <h2 className="text-[18px]">Customer</h2>
            <p className="font-semibold">
              {e.name} {!e.customer && <span className="font-normal text-plum/60">(guest)</span>}
            </p>
            {e.email && (
              <a href={`mailto:${e.email}`} className="flex items-center gap-2 break-all hover:underline">
                <Mail className="h-4 w-4 shrink-0 text-gold" /> {e.email}
              </a>
            )}
            {e.phone && (
              <a href={`tel:${e.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 text-gold" /> {e.phone}
              </a>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-beige bg-ivory p-5">
            <Select label="Status" value={e.status} onChange={(ev) => patch.mutate({ status: ev.target.value as EnquiryStatus })}>
              <option value="NEW">New</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="RESPONDED">Responded</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Button variant="outline" size="sm" className="w-full" onClick={() => patch.mutate({ archived: !e.archived })}>
              <Archive className="h-4 w-4" /> {e.archived ? 'Restore from archive' : 'Archive'}
            </Button>
          </div>
          <div className="rounded-xl border border-gold/40 bg-[#fbf5ea] p-5">
            <h2 className="flex items-center gap-2 text-[18px]">
              <Lock className="h-4 w-4 text-gold-dark" /> Private notes
            </h2>
            <p className="text-[12px] text-plum/70">Only admins can see these.</p>
            <ul className="mt-3 space-y-2">
              {e.notes.map((n) => (
                <li key={n.id} className="rounded-md bg-ivory p-3 text-[13.5px]">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-[11.5px] text-plum/60">
                    {n.author} · {relativeTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <Textarea aria-label="Add a private note" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} wrapClassName="mt-3" placeholder="Add a note…" />
            <Button size="sm" variant="outline" className="mt-2" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>
              Add note
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}

// ═════════════ Customers ═════════════

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  counts: { appointments: number; enquiries: number; favorites: number };
}

export function AdminCustomers() {
  useDocumentTitle('Customers');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customers', dq, page],
    queryFn: () => api.get<{ items: CustomerRow[]; total: number }>(`/admin/customers?page=${page}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`),
  });
  return (
    <>
      <AdminPageHeader title="Customers" subtitle="Registered customer accounts." />
      <div className="relative mb-4 sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" />
        <input aria-label="Search customers" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, email or phone…" className="w-full rounded-md border border-beige bg-ivory py-2 pl-9 pr-3 text-[14px]" />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : !data?.items.length ? (
        <EmptyState title="No customers found" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-beige bg-ivory">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="border-b border-beige text-[11px] uppercase tracking-[0.08em] text-plum/70">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige">
              {data.items.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-cream" onClick={() => setOpen(c.id)}>
                  <td className="px-4 py-3">
                    <button className="font-semibold hover:underline" onClick={() => setOpen(c.id)}>
                      {c.name}
                    </button>
                    {!c.isActive && <span className="ml-2 text-[11px] text-danger">disabled</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.email}
                    {c.phone && <span className="block text-[12px] text-plum/70">{c.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-plum/80">
                    {c.counts.appointments} appts · {c.counts.enquiries} enquiries · {c.counts.favorites} ♥
                  </td>
                  <td className="px-4 py-3 text-[13px] text-plum/80">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > 25 && (
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
      {open && <CustomerDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () =>
      api.get<{
        customer: CustomerRow & {
          appointments: { id: string; reference: string; serviceTitle: string; startAt: string; status: string }[];
          enquiries: { id: string; reference: string; subject: string; status: string; createdAt: string }[];
          favoriteCount: number;
        };
      }>(`/admin/customers/${id}`),
  });
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/admin/customers/${id}`, { isActive }),
    onSuccess: () => {
      toast('Account updated');
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/admin/customers/${id}/reset-link`),
    onSuccess: (r) => setLink(r.url),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const c = data?.customer;
  return (
    <Modal open onClose={onClose} title={c?.name ?? 'Customer'} size="lg">
      {isLoading || !c ? (
        <PageLoader />
      ) : (
        <div className="space-y-5 text-[14px]">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="label-caps block text-plum/60">Email</span>
              {c.email} {c.emailVerified ? '✓' : <span className="text-plum/60">(unverified)</span>}
            </p>
            <p>
              <span className="label-caps block text-plum/60">Phone</span>
              {c.phone ?? '—'}
            </p>
            <p>
              <span className="label-caps block text-plum/60">Joined</span>
              {fmtDate(c.createdAt)}
            </p>
            <p>
              <span className="label-caps block text-plum/60">Last sign-in</span>
              {c.lastLoginAt ? fmtDateTime(c.lastLoginAt) : '—'}
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-[17px]">Appointments</h3>
            {c.appointments.length ? (
              <ul className="divide-y divide-beige">
                {c.appointments.map((a) => (
                  <li key={a.id} className="flex justify-between py-2">
                    <a href={`/admin/appointments?id=${a.id}`} className="hover:underline">
                      {a.serviceTitle} · {fmtDateTime(a.startAt)}
                    </a>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-plum/70">None</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-[17px]">Enquiries</h3>
            {c.enquiries.length ? (
              <ul className="divide-y divide-beige">
                {c.enquiries.map((e) => (
                  <li key={e.id} className="flex justify-between py-2">
                    <a href={`/admin/enquiries?id=${e.id}`} className="hover:underline">
                      {e.subject}
                    </a>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-plum/70">None</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-beige pt-4">
            <Button size="sm" variant="outline" loading={reset.isPending} onClick={() => reset.mutate()}>
              <KeyRound className="h-4 w-4" /> Create password reset link
            </Button>
            {c.isActive ? (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                <UserX className="h-4 w-4 text-danger" /> Disable account
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate(true)}>
                <UserCheck className="h-4 w-4" /> Re-enable account
              </Button>
            )}
          </div>
          {link && (
            <Alert tone="success">
              Share this one-time link with {c.name} (valid 24 hours):
              <div className="mt-2 flex items-center gap-2">
                <code className="block flex-1 overflow-x-auto rounded bg-ivory px-2 py-1 text-[12px]">{link}</code>
                <button
                  className="rounded p-1.5 hover:bg-ivory"
                  aria-label="Copy link"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast('Copied');
                  }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </Alert>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Disable this account?"
        message="They will be signed out and unable to sign in. Their history is kept."
        confirmLabel="Disable"
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate(false)}
        onClose={() => setConfirm(false)}
      />
    </Modal>
  );
}
