import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Bell, CalendarDays, CalendarPlus, Heart, MessageSquareText, Paperclip, Send, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle, useSite } from '../../lib/hooks';
import { fmtDateTime, relativeTime, todayIn } from '../../lib/format';
import type { CustomerAppointment, EnquiryStatus, Notification, Slot, User, WorkCard as WorkCardT } from '../../lib/types';
import { Alert, Button, ConfirmDialog, EmptyState, Input, LinkButton, Modal, PageLoader, StatusBadge, Textarea, useToast } from '../../components/ui';
import { Img, WorkCard } from '../../components/visual';

const card = 'rounded-xl border border-beige bg-ivory p-5 sm:p-6';

// ═════════════ Overview ═════════════

interface Overview {
  upcomingAppointments: CustomerAppointment[];
  pastAppointmentCount: number;
  openEnquiryCount: number;
  recentReplies: { id: string; body: string; createdAt: string; enquiry: { id: string; subject: string; reference: string } }[];
  favorites: WorkCardT[];
  unreadNotifications: number;
  notifications: Notification[];
}

export function CustomerDashboard() {
  useDocumentTitle('My account');
  const { user } = useAuth();
  const { data: site } = useSite();
  const tz = site?.booking.timezone;
  const { data, isLoading, error } = useQuery({ queryKey: ['me', 'overview'], queryFn: () => api.get<Overview>('/me/overview') });
  if (isLoading) return <PageLoader />;
  if (error || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;
  return (
    <div className="space-y-6">
      <VerifyBanner user={user} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Upcoming visits', data.upcomingAppointments.length, '/customer/appointments', CalendarDays],
          ['Open enquiries', data.openEnquiryCount, '/customer/enquiries', MessageSquareText],
          ['Unread updates', data.unreadNotifications, '/customer/notifications', Bell],
        ].map(([label, n, to, Icon]) => {
          const I = Icon as typeof Bell;
          return (
            <Link key={label as string} to={to as string} className={clsx(card, 'flex items-center gap-4 transition hover:border-gold')}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush-50 text-rose">
                <I className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-serif text-[28px] leading-none">{n as number}</span>
                <span className="text-[13px] text-plum/80">{label as string}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <section className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px]">Upcoming appointments</h2>
          <LinkButton to="/appointments" size="sm" variant="soft">
            <CalendarPlus className="h-4 w-4" /> Book
          </LinkButton>
        </div>
        {data.upcomingAppointments.length ? (
          <ul className="divide-y divide-beige">
            {data.upcomingAppointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold">{a.serviceTitle}</p>
                  <p className="text-[13.5px] text-plum/80">{fmtDateTime(a.startAt, tz)}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14.5px] text-plum/80">
            No upcoming appointments.{' '}
            <Link to="/appointments" className="text-rose-deep underline">
              Book a visit
            </Link>
            {data.pastAppointmentCount > 0 && ` · ${data.pastAppointmentCount} past`}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-4 text-[22px]">Latest replies from the boutique</h2>
        {data.recentReplies.length ? (
          <ul className="space-y-3">
            {data.recentReplies.map((r) => (
              <li key={r.id}>
                <Link to={`/customer/enquiries?id=${r.enquiry.id}`} className="block rounded-lg bg-cream p-4 transition hover:bg-blush-50">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-gold-dark">
                    {r.enquiry.subject} · {relativeTime(r.createdAt)}
                  </p>
                  <p className="mt-1 text-[14.5px] text-plum">{r.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14.5px] text-plum/80">
            Replies to your enquiries will appear here.{' '}
            <Link to="/contact" className="text-rose-deep underline">
              Send an enquiry
            </Link>
          </p>
        )}
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px]">Favourites</h2>
          {data.favorites.length > 0 && (
            <Link to="/customer/favorites" className="text-[13px] text-rose-deep underline">
              See all
            </Link>
          )}
        </div>
        {data.favorites.length ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.favorites.map((w) => (
              <Link key={w.id} to={`/recent-work/${w.slug}`} className="group">
                <Img media={w.cover} alt={w.title} thumb ratio="3/4" />
                <p className="mt-2 line-clamp-1 text-[14px] font-medium group-hover:text-rose-deep">{w.title}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[14.5px] text-plum/80">
            Tap the heart on any design to save it here.{' '}
            <Link to="/recent-work" className="text-rose-deep underline">
              Browse recent work
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function VerifyBanner({ user }: { user: User | null }) {
  const { emailVerificationRequired } = useAuth();
  const { data: site } = useSite();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerified || !site?.emailEnabled) return null;
  return (
    <Alert tone={emailVerificationRequired ? 'warning' : 'info'}>
      Please verify your email address{emailVerificationRequired ? ' before booking or sending enquiries' : ''}.{' '}
      <button
        className="font-semibold underline"
        disabled={sending}
        onClick={async () => {
          setSending(true);
          try {
            await api.post('/auth/resend-verification');
            toast('Verification email sent');
          } catch (e) {
            toast(errorMessage(e), 'error');
          } finally {
            setSending(false);
          }
        }}
      >
        Resend link
      </button>
    </Alert>
  );
}

// ═════════════ Profile ═════════════

export function CustomerProfile() {
  useDocumentTitle('Profile');
  const { setUser } = useAuth();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['me', 'profile'], queryFn: () => api.get<{ user: User & { createdAt: string } }>('/me/profile') });
  const [form, setForm] = useState({ name: '', email: '', phone: '', currentPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (data) setForm({ name: data.user.name, email: data.user.email, phone: data.user.phone ?? '', currentPassword: '' });
  }, [data]);
  if (isLoading || !data) return <PageLoader />;
  const emailChanged = form.email.trim().toLowerCase() !== data.user.email;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    setSaving(true);
    try {
      const res = await api.patch<{ user: User; emailChanged: boolean; verificationSent: boolean }>('/me/profile', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        currentPassword: emailChanged ? form.currentPassword : undefined,
      });
      setUser(res.user);
      setForm((f) => ({ ...f, currentPassword: '' }));
      toast(res.verificationSent ? 'Saved — check your inbox to verify your new email' : 'Profile saved');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fields);
      }
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.newPassword !== pw.confirm) return setPwError('New passwords do not match.');
    setPwSaving(true);
    try {
      await api.post('/me/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password updated. Other devices have been signed out.');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className={clsx(card, 'space-y-4')} noValidate>
        <h2 className="text-[22px]">Your details</h2>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} autoComplete="name" />
          <Input label="Mobile" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} autoComplete="tel" />
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
            autoComplete="email"
            hint={data.user.emailVerified ? 'Verified' : undefined}
          />
          {emailChanged && (
            <Input label="Current password" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} hint="Required to change your email" autoComplete="current-password" />
          )}
        </div>
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </form>
      <form onSubmit={changePassword} className={clsx(card, 'space-y-4')} noValidate>
        <h2 className="text-[22px]">Change password</h2>
        {pwError && <Alert tone="error">{pwError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Current password" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
          <Input label="New password" type="password" required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
          <Input label="Confirm new" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
        </div>
        <Button type="submit" variant="outline" loading={pwSaving}>
          Update password
        </Button>
      </form>
    </div>
  );
}

// ═════════════ Appointments ═════════════

export function CustomerAppointments() {
  useDocumentTitle('My appointments');
  const { data: site } = useSite();
  const tz = site?.booking.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['me', 'appointments'], queryFn: () => api.get<{ appointments: CustomerAppointment[] }>('/me/appointments') });
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<CustomerAppointment | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/me/appointments/${id}/cancel`, {}),
    onSuccess: () => {
      toast('Appointment cancelled');
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (isLoading || !data) return <PageLoader />;
  const now = Date.now();
  const upcoming = data.appointments.filter((a) => new Date(a.startAt).getTime() >= now && ['PENDING', 'CONFIRMED'].includes(a.status)).reverse();
  const past = data.appointments.filter((a) => !upcoming.includes(a));

  const Row = ({ a, actionable }: { a: CustomerAppointment; actionable: boolean }) => (
    <li className={clsx(card, 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[20px]">{a.serviceTitle}</h3>
          <StatusBadge status={a.status} />
        </div>
        <p className="mt-1 text-[14.5px] text-plum">{fmtDateTime(a.startAt, tz)}</p>
        <p className="text-[12px] text-plum/60">Ref {a.reference}</p>
        {a.statusNote && <p className="mt-2 rounded-md bg-blush-50 px-3 py-2 text-[13.5px] text-rose-deep">Note from the boutique: {a.statusNote}</p>}
        {a.pendingRequest && (
          <p className="mt-2 rounded-md bg-[#fdf3dc] px-3 py-2 text-[13.5px] text-[#7a5410]">
            Reschedule requested to {a.pendingRequest.requestedStartAt ? fmtDateTime(a.pendingRequest.requestedStartAt, tz) : '—'} — awaiting the boutique.
          </p>
        )}
        {a.relatedWork && (
          <Link to={`/recent-work/${a.relatedWork.slug}`} className="mt-1 inline-block text-[13px] text-rose-deep underline">
            About: {a.relatedWork.title}
          </Link>
        )}
      </div>
      {actionable && (
        <div className="flex shrink-0 gap-2">
          {!a.pendingRequest && (
            <Button size="sm" variant="outline" onClick={() => setRescheduleFor(a)}>
              Reschedule
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCancelId(a.id)}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[26px]">Upcoming</h2>
        <LinkButton to="/appointments" size="sm">
          <CalendarPlus className="h-4 w-4" /> New booking
        </LinkButton>
      </div>
      {upcoming.length ? (
        <ul className="space-y-3">
          {upcoming.map((a) => (
            <Row key={a.id} a={a} actionable />
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarDays className="h-9 w-9" />} title="No upcoming appointments" action={<LinkButton to="/appointments">Book an appointment</LinkButton>} />
      )}
      {past.length > 0 && (
        <>
          <h2 className="text-[26px]">History</h2>
          <ul className="space-y-3">
            {past.map((a) => (
              <Row key={a.id} a={a} actionable={false} />
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={Boolean(cancelId)}
        title="Cancel appointment?"
        message="This frees up the time for someone else. You can always book again."
        confirmLabel="Cancel appointment"
        loading={cancel.isPending}
        onConfirm={() => cancelId && cancel.mutate(cancelId)}
        onClose={() => setCancelId(null)}
      />
      {rescheduleFor && <RescheduleModal appt={rescheduleFor} onClose={() => setRescheduleFor(null)} />}
    </div>
  );
}

function RescheduleModal({ appt, onClose }: { appt: CustomerAppointment; onClose: () => void }) {
  const { data: site } = useSite();
  const tz = site?.booking.timezone ?? 'Asia/Kolkata';
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const slots = useQuery({
    queryKey: ['booking', 'slots', date],
    queryFn: () => api.get<{ slots: Slot[] }>(`/appointments/slots?date=${date}`),
    enabled: Boolean(date),
  });
  const m = useMutation({
    mutationFn: () => api.post(`/me/appointments/${appt.id}/reschedule-request`, { requestedStartAt: slot, message }),
    onSuccess: () => {
      toast('Reschedule request sent');
      qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Request a new time"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!slot} loading={m.isPending} onClick={() => m.mutate()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-plum">
          Current: <strong>{fmtDateTime(appt.startAt, tz)}</strong>. The boutique will confirm the new time.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="New date" type="date" min={todayIn(tz)} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} />
        {date &&
          (slots.isLoading ? (
            <PageLoader />
          ) : slots.data?.slots.length ? (
            <div className="grid grid-cols-3 gap-2">
              {slots.data.slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  aria-pressed={slot === s.start}
                  onClick={() => setSlot(s.start)}
                  className={clsx('rounded-md border px-2 py-2.5 text-[14px] font-semibold', slot === s.start ? 'border-rose bg-rose text-white' : 'border-beige hover:border-gold')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-plum/80">No open times on this date.</p>
          ))}
        <Textarea label="Message (optional)" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </Modal>
  );
}

// ═════════════ Enquiries ═════════════

interface EnquiryListItem {
  id: string;
  reference: string;
  subject: string;
  status: EnquiryStatus;
  serviceLabel: string | null;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
}
interface EnquiryThread {
  id: string;
  reference: string;
  subject: string;
  status: EnquiryStatus;
  serviceLabel: string | null;
  createdAt: string;
  relatedWork: { slug: string; title: string } | null;
  messages: { id: string; authorType: 'CUSTOMER' | 'ADMIN'; body: string; createdAt: string }[];
  attachments: { id: string; url: string; thumbUrl: string }[];
}

export function CustomerEnquiries() {
  useDocumentTitle('My enquiries');
  const [params, setParams] = useSearchParams();
  const selected = params.get('id');
  const { data, isLoading } = useQuery({ queryKey: ['me', 'enquiries'], queryFn: () => api.get<{ enquiries: EnquiryListItem[] }>('/me/enquiries') });
  if (selected) return <EnquiryThreadView id={selected} onBack={() => setParams({})} />;
  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[26px]">Enquiries</h2>
        <LinkButton to="/contact" size="sm">
          New enquiry
        </LinkButton>
      </div>
      {data.enquiries.length ? (
        <ul className="space-y-3">
          {data.enquiries.map((e) => (
            <li key={e.id}>
              <button onClick={() => setParams({ id: e.id })} className={clsx(card, 'block w-full text-left transition hover:border-gold')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[19px]">{e.subject}</h3>
                  <StatusBadge status={e.status} />
                </div>
                <p className="mt-1 text-[13px] text-plum/75">
                  {e.reference} · {e.serviceLabel ?? 'General'} · updated {relativeTime(e.lastActivityAt)}
                  {e.replyCount > 0 && ` · ${e.replyCount} repl${e.replyCount === 1 ? 'y' : 'ies'}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<MessageSquareText className="h-9 w-9" />} title="No enquiries yet" action={<LinkButton to="/contact">Send an enquiry</LinkButton>}>
          Ask about a design, fabric or fitting — our replies will show up here.
        </EmptyState>
      )}
    </div>
  );
}

function EnquiryThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [msg, setMsg] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['me', 'enquiry', id], queryFn: () => api.get<{ enquiry: EnquiryThread }>(`/me/enquiries/${id}`) });
  const send = useMutation({
    mutationFn: () => api.post<{ enquiry: EnquiryThread }>(`/me/enquiries/${id}/messages`, { message: msg }),
    onSuccess: (res) => {
      qc.setQueryData(['me', 'enquiry', id], res);
      qc.invalidateQueries({ queryKey: ['me', 'enquiries'] });
      setMsg('');
      toast('Message sent');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (isLoading) return <PageLoader />;
  if (error || !data)
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert tone="error" className="mt-3">
          {errorMessage(error)}
        </Alert>
      </div>
    );
  const e = data.enquiry;
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> All enquiries
      </Button>
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[24px]">{e.subject}</h2>
            <p className="text-[13px] text-plum/70">
              {e.reference} · {e.serviceLabel ?? 'General'}
              {e.relatedWork && (
                <>
                  {' · '}
                  <Link to={`/recent-work/${e.relatedWork.slug}`} className="text-rose-deep underline">
                    {e.relatedWork.title}
                  </Link>
                </>
              )}
            </p>
          </div>
          <StatusBadge status={e.status} />
        </div>
        {e.attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {e.attachments.map((a, i) => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-md ring-1 ring-beige" aria-label={`Reference image ${i + 1}`}>
                <img src={a.thumbUrl} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <ol className="mt-6 space-y-4">
          {e.messages.map((m) => (
            <li key={m.id} className={clsx('flex', m.authorType === 'CUSTOMER' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3', m.authorType === 'CUSTOMER' ? 'rounded-br-sm bg-rose text-white' : 'rounded-bl-sm border border-beige bg-cream')}>
                <p className={clsx('mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]', m.authorType === 'CUSTOMER' ? 'text-white/80' : 'text-gold-dark')}>
                  {m.authorType === 'CUSTOMER' ? 'You' : 'SVSS Boutique'} · {relativeTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-line text-[14.5px]">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {e.status === 'CLOSED' ? (
          <Alert className="mt-6">
            This enquiry is closed.{' '}
            <Link to="/contact" className="underline">
              Start a new one
            </Link>
          </Alert>
        ) : (
          <form
            className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (msg.trim()) send.mutate();
            }}
          >
            <Textarea label="Reply" rows={2} value={msg} onChange={(ev) => setMsg(ev.target.value)} wrapClassName="flex-1" maxLength={4000} />
            <Button type="submit" loading={send.isPending} disabled={!msg.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </form>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[12px] text-plum/60">
        <Paperclip className="h-3.5 w-3.5" /> Reference images are private to you and the boutique.
      </p>
    </div>
  );
}

// ═════════════ Favourites ═════════════

export function CustomerFavorites() {
  useDocumentTitle('Favourites');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['favorites', 'list'],
    queryFn: () => api.get<{ favorites: { workId: string; available: boolean; savedAt: string; work: WorkCardT | null }[] }>('/me/favorites'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/me/favorites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
      toast('Removed');
    },
  });
  if (isLoading || !data) return <PageLoader />;
  const available = data.favorites.filter((f) => f.available && f.work);
  const unavailable = data.favorites.filter((f) => !f.available);
  return (
    <div className="space-y-6">
      <h2 className="text-[26px]">Favourites</h2>
      {available.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {available.map((f) => (
            <WorkCard key={f.workId} work={f.work!} />
          ))}
        </div>
      ) : (
        !unavailable.length && (
          <EmptyState icon={<Heart className="h-9 w-9" />} title="Nothing saved yet" action={<LinkButton to="/recent-work">Browse recent work</LinkButton>}>
            Tap the heart on any design to keep it here for later.
          </EmptyState>
        )
      )}
      {unavailable.length > 0 && (
        <div className={card}>
          <h3 className="text-[18px]">No longer on display</h3>
          <p className="mt-1 text-[13.5px] text-plum/80">These saved designs have been taken down by the boutique.</p>
          <ul className="mt-3 divide-y divide-beige">
            {unavailable.map((f) => (
              <li key={f.workId} className="flex items-center justify-between py-2.5 text-[14px]">
                <span className="text-plum/80">Saved {relativeTime(f.savedAt)}</span>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.workId)}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═════════════ Notifications ═════════════

export function CustomerNotifications() {
  useDocumentTitle('Notifications');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => api.get<{ notifications: Notification[]; unread: number }>('/me/notifications'),
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/me/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[26px]">Notifications</h2>
        {data.unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => readAll.mutate()} loading={readAll.isPending}>
            Mark all read
          </Button>
        )}
      </div>
      {data.notifications.length ? (
        <ul className="space-y-2">
          {data.notifications.map((n) => (
            <li key={n.id} className={clsx(card, 'flex items-start gap-3 !py-4', !n.read && 'border-blush bg-blush-50/60')}>
              <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-beige' : 'bg-rose')} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                {n.body && <p className="text-[14px] text-plum/85">{n.body}</p>}
                <p className="mt-1 text-[12px] text-plum/60">{relativeTime(n.createdAt)}</p>
              </div>
              {n.link && (
                <Link to={n.link} onClick={() => !n.read && readOne.mutate(n.id)} className="shrink-0 text-[13px] text-rose-deep underline">
                  View
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Bell className="h-9 w-9" />} title="You’re all caught up">
          Updates about your appointments and enquiries will appear here.
        </EmptyState>
      )}
    </div>
  );
}
