import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, List, Mail, Phone, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { fmtDateTime, fmtPlainDate, fmtTime, todayIn } from '../../lib/format';
import type { AppointmentStatus, Slot } from '../../lib/types';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, EmptyState, Input, Modal, PageLoader, Select, StatusBadge, Textarea, Toggle, useToast } from '../../components/ui';

interface AdminAppt {
  id: string;
  reference: string;
  name: string;
  email: string | null;
  phone: string | null;
  serviceTitle: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  message: string | null;
  designRef: string | null;
  adminNotes: string | null;
  statusNote: string | null;
  customer: { id: string; name: string; email: string } | null;
  isGuest: boolean;
  createdAt: string;
  pendingRequest: { id: string; requestedStartAt: string | null; message: string | null; createdAt: string } | null;
  relatedWork?: { slug: string; title: string } | null;
  logs?: { id: string; action: string; actorRole: string; actorName: string | null; fromStatus: string | null; toStatus: string | null; createdAt: string }[];
}

/** yyyy-mm-dd in tz → UTC ISO of local midnight (approximation via Intl offset). */
function localMidnightUtc(ymd: string, tz: string) {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function localYmd(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const TABS = [
  { id: 'list', label: 'List', icon: List },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'availability', label: 'Hours & settings', icon: Settings2 },
] as const;

export function AdminAppointments() {
  useDocumentTitle('Appointments');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number]['id']) ?? 'list';
  const openId = params.get('id');
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };
  return (
    <>
      <AdminPageHeader title="Appointments" subtitle="Confirm, reschedule or cancel bookings and manage working hours." />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-beige bg-ivory p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParam('tab', t.id === 'list' ? null : t.id)}
            className={clsx('inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold', tab === t.id ? 'bg-rose text-white' : 'text-brown hover:bg-blush-50')}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'list' && <ApptList onOpen={(id) => setParam('id', id)} />}
      {tab === 'calendar' && <ApptCalendar onOpen={(id) => setParam('id', id)} />}
      {tab === 'availability' && <Availability />}
      {openId && <ApptDetail id={openId} onClose={() => setParam('id', null)} />}
    </>
  );
}

function useTz() {
  const q = useQuery({ queryKey: ['admin', 'availability'], queryFn: () => api.get<AvailabilityData>('/admin/appointments/config/availability') });
  return q.data?.settings.timezone ?? 'Asia/Kolkata';
}

function ApptList({ onOpen }: { onOpen: (id: string) => void }) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'upcoming';
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const tz = useTz();
  const from = status === 'upcoming' || status === 'PENDING' || status === 'CONFIRMED' ? new Date(Date.now() - 2 * 3600 * 1000).toISOString() : undefined;
  const apiStatus = status === 'upcoming' || status === 'past' ? 'all' : status;
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'appointments', 'list', status, dq],
    queryFn: () =>
      api.get<{ items: AdminAppt[] }>(
        `/admin/appointments?status=${apiStatus}${from ? `&from=${encodeURIComponent(from)}` : ''}${status === 'past' ? `&to=${encodeURIComponent(new Date().toISOString())}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`,
      ),
  });
  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (status === 'upcoming') return list.filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status));
    if (status === 'past') return [...list].reverse();
    return list;
  }, [data, status]);
  const set = (v: string) => {
    const p = new URLSearchParams(params);
    p.set('status', v);
    setParams(p);
  };
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-wrap gap-1.5">
          {[
            ['upcoming', 'Upcoming'],
            ['PENDING', 'Pending'],
            ['CONFIRMED', 'Confirmed'],
            ['requests', 'Reschedule requests'],
            ['past', 'Past'],
            ['CANCELLED', 'Cancelled'],
            ['REJECTED', 'Declined'],
          ].map(([v, l]) => (
            <button key={v} onClick={() => set(v)} className={clsx('rounded-full border px-3 py-1.5 text-[12px] font-semibold', status === v ? 'border-rose bg-rose text-white' : 'border-beige bg-ivory')}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" />
          <input aria-label="Search appointments" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ref, phone…" className="w-full rounded-md border border-beige bg-ivory py-2 pl-9 pr-3 text-[14px]" />
        </div>
      </div>
      {isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState title="No appointments here" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-beige bg-ivory">
          <table className="w-full text-left text-[14px]">
            <thead className="hidden border-b border-beige text-[11px] uppercase tracking-[0.08em] text-plum/70 md:table-header-group">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige">
              {items.map((a) => (
                <tr key={a.id} onClick={() => onOpen(a.id)} className="block cursor-pointer px-4 py-3 hover:bg-cream md:table-row md:p-0">
                  <td className="block md:table-cell md:px-4 md:py-3">
                    <span className="font-semibold">{fmtDateTime(a.startAt, tz)}</span>
                  </td>
                  <td className="block md:table-cell md:px-4 md:py-3">
                    <button className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(a.id); }}>
                      {a.name}
                    </button>
                    <span className="block text-[12px] text-plum/65">
                      {a.reference}
                      {a.isGuest && ' · guest'}
                    </span>
                  </td>
                  <td className="block text-plum md:table-cell md:px-4 md:py-3">{a.serviceTitle}</td>
                  <td className="mt-1 flex gap-2 md:table-cell md:px-4 md:py-3">
                    <StatusBadge status={a.status} />
                    {a.pendingRequest && <span className="ml-1 rounded-full bg-[#fdf3dc] px-2 py-0.5 text-[11px] font-semibold text-[#7a5410]">Reschedule asked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ApptCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const tz = useTz();
  const [view, setView] = useState<'week' | 'month' | 'day'>('week');
  const [anchor, setAnchor] = useState(() => todayIn(tz));
  const range = useMemo(() => {
    if (view === 'day') return { start: anchor, days: 1 };
    if (view === 'week') {
      const d = new Date(`${anchor}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7;
      return { start: addDays(anchor, -dow), days: 7 };
    }
    const first = `${anchor.slice(0, 7)}-01`;
    const d = new Date(`${first}T00:00:00Z`);
    const lead = (d.getUTCDay() + 6) % 7;
    return { start: addDays(first, -lead), days: 42 };
  }, [view, anchor]);
  const end = addDays(range.start, range.days);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'appointments', 'cal', range.start, end, tz],
    queryFn: () => api.get<{ items: AdminAppt[] }>(`/admin/appointments?from=${encodeURIComponent(localMidnightUtc(range.start, tz))}&to=${encodeURIComponent(localMidnightUtc(end, tz))}&limit=500`),
  });
  const byDay = useMemo(() => {
    const m = new Map<string, AdminAppt[]>();
    for (const a of data?.items ?? []) {
      if (['CANCELLED', 'REJECTED'].includes(a.status)) continue;
      const k = localYmd(a.startAt, tz);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [data, tz]);
  const days = Array.from({ length: range.days }, (_, i) => addDays(range.start, i));
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
  const shift = (dir: number) => {
    if (view === 'month') {
      const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, dir * step));
  };
  const today = todayIn(tz);
  const title =
    view === 'month'
      ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${anchor}T00:00:00Z`))
      : view === 'week'
        ? `${fmtPlainDate(range.start)} – ${fmtPlainDate(addDays(range.start, 6))}`
        : fmtPlainDate(anchor);
  return (
    <div className="rounded-xl border border-beige bg-ivory p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="rounded-full p-2 hover:bg-blush-50" onClick={() => shift(-1)} aria-label="Previous">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button className="rounded-full p-2 hover:bg-blush-50" onClick={() => shift(1)} aria-label="Next">
          <ChevronRight className="h-5 w-5" />
        </button>
        <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
          Today
        </Button>
        <h2 className="text-[18px]">{title}</h2>
        <div className="ml-auto flex rounded-md border border-beige p-0.5">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={clsx('rounded px-3 py-1.5 text-[12px] font-semibold capitalize', view === v ? 'bg-rose text-white' : '')}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className={clsx('grid gap-1.5', view === 'day' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-7')}>
          {view !== 'day' &&
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="hidden text-center text-[11px] font-semibold uppercase tracking-wider text-plum/60 sm:block">
                {d}
              </div>
            ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const outside = view === 'month' && d.slice(0, 7) !== anchor.slice(0, 7);
            if (view === 'month' && outside && !list.length) return <div key={d} className="hidden min-h-[90px] rounded-md bg-cream/40 sm:block" />;
            return (
              <div key={d} className={clsx('rounded-md border p-2', d === today ? 'border-gold bg-[#fbf5ea]' : 'border-beige bg-cream/50', view === 'month' ? 'min-h-[90px]' : 'min-h-[140px]', outside && 'opacity-50')}>
                <p className="mb-1.5 text-[12px] font-semibold text-plum">
                  <span className="sm:hidden">{fmtPlainDate(d)}</span>
                  <span className="hidden sm:inline">{Number(d.slice(8))}</span>
                </p>
                <ul className="space-y-1">
                  {list.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => onOpen(a.id)}
                        className={clsx('w-full truncate rounded px-1.5 py-1 text-left text-[11.5px] font-medium', a.status === 'CONFIRMED' ? 'bg-[#e8f4ec] text-[#2d5c43]' : a.status === 'PENDING' ? 'bg-[#fdf3dc] text-[#7a5410]' : 'bg-beige/60 text-plum')}
                      >
                        {fmtTime(a.startAt, tz)} {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApptDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const tz = useTz();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'appointment', id], queryFn: () => api.get<{ appointment: AdminAppt }>(`/admin/appointments/${id}`) });
  const [note, setNote] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [reschedule, setReschedule] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) {
      setAdminNotes(data.appointment.adminNotes ?? '');
      setNote('');
    }
  }, [data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const status = useMutation({
    mutationFn: (s: AppointmentStatus) => api.patch(`/admin/appointments/${id}/status`, { status: s, statusNote: note || undefined }),
    onSuccess: () => {
      toast('Status updated — the customer can see it');
      setErr(null);
      refresh();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const notes = useMutation({
    mutationFn: () => api.patch(`/admin/appointments/${id}/notes`, { adminNotes }),
    onSuccess: () => {
      toast('Private notes saved');
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const decline = useMutation({
    mutationFn: (rid: string) => api.post(`/admin/appointments/${id}/requests/${rid}/decline`, { statusNote: note || undefined }),
    onSuccess: () => {
      toast('Request declined');
      refresh();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const approve = useMutation({
    mutationFn: (r: { id: string; at: string }) => api.post(`/admin/appointments/${id}/reschedule`, { startAt: r.at, fromRequestId: r.id, statusNote: note || undefined }),
    onSuccess: () => {
      toast('Rescheduled');
      refresh();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const a = data?.appointment;
  const actions: Partial<Record<AppointmentStatus, { to: AppointmentStatus; label: string; variant: 'primary' | 'outline' | 'danger' | 'ghost' }[]>> = {
    PENDING: [
      { to: 'CONFIRMED', label: 'Confirm', variant: 'primary' },
      { to: 'REJECTED', label: 'Decline', variant: 'outline' },
      { to: 'CANCELLED', label: 'Cancel', variant: 'ghost' },
    ],
    CONFIRMED: [
      { to: 'COMPLETED', label: 'Mark completed', variant: 'primary' },
      { to: 'CANCELLED', label: 'Cancel', variant: 'outline' },
    ],
    CANCELLED: [{ to: 'CONFIRMED', label: 'Re-confirm', variant: 'outline' }],
    REJECTED: [{ to: 'CONFIRMED', label: 'Confirm after all', variant: 'outline' }],
    COMPLETED: [],
  };
  return (
    <Modal open onClose={onClose} title={a ? `${a.name} · ${a.reference}` : 'Appointment'} size="lg">
      {isLoading ? (
        <PageLoader />
      ) : error || !a ? (
        <Alert tone="error">{errorMessage(error)}</Alert>
      ) : (
        <div className="space-y-5">
          {err && <Alert tone="error">{err}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={a.status} />
            <span className="text-[15px] font-semibold">{fmtDateTime(a.startAt, tz)}</span>
            <span className="text-plum/80">· {a.serviceTitle}</span>
          </div>
          <div className="grid gap-3 rounded-lg bg-cream p-4 text-[14px] sm:grid-cols-2">
            <p>
              <span className="label-caps block text-plum/60">Customer</span>
              {a.name} {a.isGuest ? <span className="text-plum/60">(guest)</span> : <span className="text-plum/60">(account)</span>}
            </p>
            <p>
              <span className="label-caps block text-plum/60">Contact</span>
              {a.email && (
                <a href={`mailto:${a.email}`} className="flex items-center gap-1.5 hover:underline">
                  <Mail className="h-3.5 w-3.5" /> {a.email}
                </a>
              )}
              {a.phone && (
                <a href={`tel:${a.phone}`} className="flex items-center gap-1.5 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {a.phone}
                </a>
              )}
            </p>
            {a.message && (
              <p className="sm:col-span-2">
                <span className="label-caps block text-plum/60">Message</span>
                <span className="whitespace-pre-line">{a.message}</span>
              </p>
            )}
            {(a.designRef || a.relatedWork) && (
              <p className="sm:col-span-2">
                <span className="label-caps block text-plum/60">Design reference</span>
                {a.designRef}
                {a.relatedWork && (
                  <a href={`/recent-work/${a.relatedWork.slug}`} target="_blank" rel="noreferrer" className="ml-1 text-rose-deep underline">
                    {a.relatedWork.title}
                  </a>
                )}
              </p>
            )}
          </div>

          {a.pendingRequest && a.pendingRequest.requestedStartAt && (
            <div className="rounded-lg border border-[#ecd9a8] bg-[#fdf3dc] p-4 text-[14px]">
              <p className="font-semibold text-[#7a5410]">Customer asked to move this to {fmtDateTime(a.pendingRequest.requestedStartAt, tz)}</p>
              {a.pendingRequest.message && <p className="mt-1 text-[#7a5410]">“{a.pendingRequest.message}”</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate({ id: a.pendingRequest!.id, at: a.pendingRequest!.requestedStartAt! })}>
                  Approve new time
                </Button>
                <Button size="sm" variant="outline" loading={decline.isPending} onClick={() => decline.mutate(a.pendingRequest!.id)}>
                  Decline
                </Button>
              </div>
            </div>
          )}

          <div>
            <Textarea label="Note to customer (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} hint={a.statusNote ? `Current note: “${a.statusNote}”` : 'Shown to the customer with the status change.'} />
            <div className="mt-3 flex flex-wrap gap-2">
              {(actions[a.status] ?? []).map((x) => (
                <Button key={x.to} size="sm" variant={x.variant} loading={status.isPending && status.variables === x.to} onClick={() => status.mutate(x.to)}>
                  {x.label}
                </Button>
              ))}
              {['PENDING', 'CONFIRMED'].includes(a.status) && (
                <Button size="sm" variant="ghost" className="ring-1 ring-beige" onClick={() => setReschedule(true)}>
                  Reschedule
                </Button>
              )}
            </div>
          </div>

          <div>
            <Textarea label="Private admin notes" rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} hint="Never shown to the customer." />
            <Button size="sm" variant="outline" className="mt-2" loading={notes.isPending} onClick={() => notes.mutate()} disabled={adminNotes === (a.adminNotes ?? '')}>
              Save notes
            </Button>
          </div>

          {a.logs && a.logs.length > 0 && (
            <details className="rounded-lg border border-beige p-3">
              <summary className="cursor-pointer text-[13px] font-semibold">History ({a.logs.length})</summary>
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {a.logs.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span>
                      {l.action.replace(/_/g, ' ').toLowerCase()}
                      {l.toStatus && ` → ${l.toStatus.toLowerCase()}`} <span className="text-plum/60">by {l.actorName ?? l.actorRole.toLowerCase()}</span>
                    </span>
                    <span className="shrink-0 text-plum/60">{fmtDateTime(l.createdAt, tz)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {reschedule && <RescheduleDialog appt={a} tz={tz} onClose={() => setReschedule(false)} />}
        </div>
      )}
    </Modal>
  );
}

function RescheduleDialog({ appt, tz, onClose }: { appt: AdminAppt; tz: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(localYmd(appt.startAt, tz));
  const [slot, setSlot] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [time, setTime] = useState('11:00');
  const [err, setErr] = useState<string | null>(null);
  const slots = useQuery({ queryKey: ['booking', 'slots', date], queryFn: () => api.get<{ slots: Slot[] }>(`/appointments/slots?date=${date}`), enabled: !outside });
  const m = useMutation({
    mutationFn: () => {
      const startAt = outside ? new Date(new Date(localMidnightUtc(date, tz)).getTime() + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60000).toISOString() : slot;
      return api.post(`/admin/appointments/${appt.id}/reschedule`, { startAt, outsideHours: outside });
    },
    onSuccess: () => {
      toast('Rescheduled — the customer has been notified');
      qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Reschedule"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={!outside && !slot} onClick={() => m.mutate()}>
            Move appointment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} />
        <Toggle label="Outside normal hours" description="Pick any time (still prevents double booking)." checked={outside} onChange={setOutside} />
        {outside ? (
          <Input label={`Time (${tz})`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        ) : slots.isLoading ? (
          <PageLoader />
        ) : slots.data?.slots.length ? (
          <div className="grid grid-cols-3 gap-2">
            {slots.data.slots.map((s) => (
              <button key={s.start} onClick={() => setSlot(s.start)} className={clsx('rounded-md border px-2 py-2 text-[13px] font-semibold', slot === s.start ? 'border-rose bg-rose text-white' : 'border-beige')}>
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-plum/80">No open slots on this date.</p>
        )}
      </div>
    </Modal>
  );
}

// ═════════════ Availability ═════════════

interface AvailabilityData {
  settings: { enabled: boolean; timezone: string; slotMinutes: number; minLeadHours: number; maxAdvanceDays: number; allowGuests: boolean };
  rules: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
  blockedDates: { id: string; date: string; reason: string | null }[];
}
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Availability() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'availability'], queryFn: () => api.get<AvailabilityData>('/admin/appointments/config/availability') });
  const [rules, setRules] = useState<{ dayOfWeek: number; startTime: string; endTime: string }[]>([]);
  const [settings, setSettings] = useState<AvailabilityData['settings'] | null>(null);
  const [block, setBlock] = useState({ date: '', reason: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) {
      setRules(data.rules.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })));
      setSettings(data.settings);
    }
  }, [data]);
  const done = (msg: string) => {
    toast(msg);
    setErr(null);
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['site'] });
    qc.invalidateQueries({ queryKey: ['booking'] });
  };
  const saveRules = useMutation({ mutationFn: () => api.put('/admin/appointments/config/rules', { rules }), onSuccess: () => done('Working hours saved'), onError: (e) => setErr(errorMessage(e)) });
  const saveSettings = useMutation({ mutationFn: () => api.put('/admin/appointments/config/settings', settings), onSuccess: () => done('Booking settings saved'), onError: (e) => setErr(errorMessage(e)) });
  const addBlock = useMutation({
    mutationFn: () => api.post('/admin/appointments/config/blocked', block),
    onSuccess: () => {
      setBlock({ date: '', reason: '' });
      done('Date blocked');
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const removeBlock = useMutation({ mutationFn: (id: string) => api.delete(`/admin/appointments/config/blocked/${id}`), onSuccess: () => done('Date unblocked') });
  if (isLoading || !data || !settings) return <PageLoader />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {err && (
        <Alert tone="error" className="lg:col-span-2">
          {err}
        </Alert>
      )}
      <section className="rounded-xl border border-beige bg-ivory p-5">
        <h2 className="text-[20px]">Working hours</h2>
        <p className="mb-4 text-[13px] text-plum/75">Customers can only book inside these windows ({settings.timezone}). Leave a day empty to close it.</p>
        <div className="space-y-3">
          {DAYS.map((name, i) => {
            const dow = i + 1;
            const dayRules = rules.map((r, idx) => ({ ...r, idx })).filter((r) => r.dayOfWeek === dow);
            return (
              <div key={dow} className="flex flex-wrap items-start gap-3 border-b border-beige/70 pb-3">
                <span className="w-24 pt-2 text-[14px] font-semibold">{name}</span>
                <div className="flex-1 space-y-2">
                  {dayRules.length === 0 && <p className="pt-2 text-[13px] text-plum/60">Closed</p>}
                  {dayRules.map((r) => (
                    <div key={r.idx} className="flex items-center gap-2">
                      <input aria-label={`${name} opens`} type="time" value={r.startTime} onChange={(e) => setRules(rules.map((x, j) => (j === r.idx ? { ...x, startTime: e.target.value } : x)))} className="rounded-md border border-beige bg-ivory px-2 py-1.5 text-[14px]" />
                      <span>–</span>
                      <input aria-label={`${name} closes`} type="time" value={r.endTime} onChange={(e) => setRules(rules.map((x, j) => (j === r.idx ? { ...x, endTime: e.target.value } : x)))} className="rounded-md border border-beige bg-ivory px-2 py-1.5 text-[14px]" />
                      <button onClick={() => setRules(rules.filter((_, j) => j !== r.idx))} aria-label="Remove window" className="rounded p-1.5 hover:bg-blush-50">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setRules([...rules, { dayOfWeek: dow, startTime: '10:00', endTime: '18:00' }])} className="inline-flex items-center gap-1 pt-2 text-[12px] font-semibold text-rose-deep">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            );
          })}
        </div>
        <Button className="mt-4" loading={saveRules.isPending} onClick={() => saveRules.mutate()}>
          Save hours
        </Button>
      </section>
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-beige bg-ivory p-5">
          <h2 className="text-[20px]">Booking settings</h2>
          <Toggle label="Online booking open" checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
          <Toggle label="Allow guests to book without an account" checked={settings.allowGuests} onChange={(v) => setSettings({ ...settings, allowGuests: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Appointment length" value={settings.slotMinutes} onChange={(e) => setSettings({ ...settings, slotMinutes: Number(e.target.value) })}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
            <Input label="Timezone" value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} hint="e.g. Asia/Kolkata" />
            <Input label="Minimum notice (hours)" type="number" min={0} value={settings.minLeadHours} onChange={(e) => setSettings({ ...settings, minLeadHours: Number(e.target.value) })} />
            <Input label="Book up to (days ahead)" type="number" min={1} value={settings.maxAdvanceDays} onChange={(e) => setSettings({ ...settings, maxAdvanceDays: Number(e.target.value) })} />
          </div>
          <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            Save settings
          </Button>
        </section>
        <section className="rounded-xl border border-beige bg-ivory p-5">
          <h2 className="text-[20px]">Holidays &amp; blocked dates</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input label="Date" type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} />
            <Input label="Reason (optional)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} wrapClassName="flex-1" />
            <Button disabled={!block.date} loading={addBlock.isPending} onClick={() => addBlock.mutate()}>
              Block
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-beige">
            {data.blockedDates.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-[14px]">
                <span>
                  {fmtPlainDate(b.date)} {b.reason && <span className="text-plum/70">· {b.reason}</span>}
                </span>
                <button onClick={() => removeBlock.mutate(b.id)} className="rounded p-1.5 hover:bg-blush-50" aria-label="Unblock date">
                  <Trash2 className="h-4 w-4 text-danger" />
                </button>
              </li>
            ))}
            {!data.blockedDates.length && <li className="py-2 text-[13px] text-plum/60">No blocked dates.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
