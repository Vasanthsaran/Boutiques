import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSite } from '../lib/hooks';
import { fmtDateTime, todayIn } from '../lib/format';
import type { Slot } from '../lib/types';
import { Alert, Button, LinkButton, Spinner } from './ui';

const label = 'text-[11px] font-semibold uppercase tracking-wider text-brown';
const field =
  'w-full rounded-lg bg-ivory px-4 py-3 text-[14px] text-brown placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-rose disabled:text-plum/60';
const choice = (on: boolean) =>
  clsx(
    'rounded-lg px-3 py-2.5 text-center text-[13px] font-semibold tracking-[0.02em] transition-all disabled:cursor-not-allowed disabled:opacity-45',
    on ? 'bg-rose text-white' : 'bg-ivory text-brown hover:bg-blush-100',
  );

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Appointment request form in the “Personal Styling Experience” layout. Slots come live from the server. */
export function BookingForm({ defaultServiceId, relatedWork }: { defaultServiceId?: string; relatedWork?: { id: string; title: string } | null }) {
  const { user } = useAuth();
  const { data: site, isLoading: siteLoading } = useSite();
  const location = useLocation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const tz = site?.booking.timezone ?? 'Asia/Kolkata';
  const today = todayIn(tz);

  const [serviceId, setServiceId] = useState(params.get('service') ?? defaultServiceId ?? '');
  const [date, setDate] = useState(params.get('date') ?? '');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [d, setD] = useState({ name: user?.name ?? '', email: '', phone: user?.phone ?? '', message: '', designRef: '', website: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ reference: string; startAt: string; serviceTitle: string; linked: boolean } | null>(null);

  useEffect(() => {
    if (user) setD((x) => ({ ...x, name: x.name || user.name, phone: x.phone || user.phone || '' }));
  }, [user]);
  useEffect(() => {
    if (!serviceId && site?.services.length) setServiceId(site.services.find((s) => s.isAvailable)?.id ?? '');
  }, [site, serviceId]);

  const enabled = Boolean(site?.booking.enabled);
  const datesQ = useQuery({
    queryKey: ['booking', 'dates', today.slice(0, 7)],
    queryFn: async () => {
      const m1 = today.slice(0, 7);
      const m2 = addDays(`${m1}-28`, 7).slice(0, 7);
      const [a, b] = await Promise.all([
        api.get<{ dates: string[] }>(`/appointments/dates?month=${m1}`),
        api.get<{ dates: string[] }>(`/appointments/dates?month=${m2}`),
      ]);
      return [...a.dates, ...b.dates];
    },
    enabled,
  });
  // Pick the first open day automatically so slots show straight away.
  useEffect(() => {
    if (!date && datesQ.data?.length) setDate(datesQ.data[0]);
  }, [datesQ.data, date]);
  const slotsQ = useQuery({
    queryKey: ['booking', 'slots', date],
    queryFn: () => api.get<{ slots: Slot[] }>(`/appointments/slots?date=${date}`),
    enabled: enabled && Boolean(date),
  });
  const maxDate = useMemo(() => addDays(today, site?.booking.maxAdvanceDays ?? 60), [today, site?.booking.maxAdvanceDays]);

  if (siteLoading) return <Spinner />;
  if (!site) return null;
  if (user?.role === 'ADMIN') return <Alert>You are signed in as an administrator. Manage bookings from the admin dashboard.</Alert>;

  if (!enabled) {
    return (
      <div className="text-center">
        <p className="text-[15px] text-plum">Online booking opens soon. Please send us an enquiry and we will arrange a time with you.</p>
        <LinkButton to="/contact" className="mt-6">
          Send an enquiry
        </LinkButton>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center" role="status">
        <CheckCircle2 className="h-11 w-11 text-success" />
        <h3 className="mt-3 text-[26px] text-rose">Appointment requested</h3>
        <p className="mt-2 max-w-md text-[14.5px] text-plum">
          <strong className="text-brown">{done.serviceTitle}</strong> on <strong className="text-brown">{fmtDateTime(done.startAt, tz)}</strong> · Ref {done.reference}.
          <br />
          It stays <strong>pending</strong> until the boutique confirms{done.linked ? ' — you can follow the status in your account.' : '.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {done.linked && <LinkButton to="/customer/appointments">View my appointments</LinkButton>}
          <Button variant="outline" onClick={() => { setDone(null); setSlot(null); }}>
            Book another
          </Button>
        </div>
      </div>
    );
  }

  const needsLogin = !user && !site.booking.allowGuests;
  const service = site.services.find((s) => s.id === serviceId);
  const bookable = new Set(datesQ.data ?? []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!service) return setError('Please choose a service.');
    if (!slot) return setError('Please choose a time slot.');
    setSubmitting(true);
    try {
      const res = await api.post<{ appointment: { reference: string; startAt: string; serviceTitle: string; linkedToAccount: boolean } }>('/appointments', {
        name: d.name,
        email: user ? undefined : d.email,
        phone: d.phone,
        serviceId: service.id,
        startAt: slot.start,
        message: d.message,
        designRef: d.designRef || relatedWork?.title,
        relatedWorkId: relatedWork?.id,
        website: d.website,
      });
      setDone({ ...res.appointment, linked: res.appointment.linkedToAccount });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
        if (err.code === 'SLOT_UNAVAILABLE') {
          setSlot(null);
          qc.invalidateQueries({ queryKey: ['booking'] });
        }
      } else setError('Your booking could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const err = (k: string) => fieldErrors[k] && <p className="text-[12.5px] text-danger">{fieldErrors[k]}</p>;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor="bk-name">
            Full Name *
          </label>
          <input id="bk-name" className={field} required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Ananya Sharma" autoComplete="name" />
          {err('name')}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor="bk-phone">
            Mobile / WhatsApp {user ? '' : '*'}
          </label>
          <input id="bk-phone" type="tel" className={field} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" />
          {err('phone')}
        </div>
        {!user && (
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className={label} htmlFor="bk-email">
              Email (or give a mobile number)
            </label>
            <input id="bk-email" type="email" className={field} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
            {err('email')}
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={clsx(label, 'mb-2')}>Consultation Purpose</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {site.services.map((s) => (
            <button key={s.id} type="button" disabled={!s.isAvailable} aria-pressed={serviceId === s.id} onClick={() => setServiceId(s.id)} className={choice(serviceId === s.id)}>
              {s.title}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor="bk-date">
            Preferred Date *
          </label>
          <input
            id="bk-date"
            type="date"
            className={field}
            min={today}
            max={maxDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlot(null);
            }}
          />
          {date && datesQ.data && !bookable.has(date) && date <= addDays(today, 40) && (
            <p className="text-[12.5px] text-plum">The studio has no open times on this day — please pick another date.</p>
          )}
          <p className="text-[11.5px] text-plum/70">Times shown in {tz.replace('_', ' ')}.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={label} id="bk-slots">
            Preferred Time Slot *
          </span>
          {!date ? (
            <p className="py-3 text-[13px] text-plum">Choose a date to see open times.</p>
          ) : slotsQ.isLoading ? (
            <Spinner className="py-3" />
          ) : slotsQ.data?.slots.length ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="bk-slots">
              {slotsQ.data.slots.map((s) => (
                <button key={s.start} type="button" aria-pressed={slot?.start === s.start} onClick={() => setSlot(s)} className={clsx(choice(slot?.start === s.start), 'py-3 text-[12px]')}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-3 text-[13px] text-plum">No open times on this date.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor="bk-notes">
          Occasion / Custom Preferences (Optional)
        </label>
        <textarea
          id="bk-notes"
          rows={3}
          className={field}
          value={d.message}
          onChange={(e) => setD({ ...d, message: e.target.value })}
          placeholder={relatedWork ? `About “${relatedWork.title}” — tell us what you would like…` : 'Tell us about your occasion, colour preferences, or embroidery ideas…'}
        />
      </div>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} />
      </div>

      {needsLogin ? (
        <div className="rounded-xl bg-ivory p-5 text-center">
          <p className="text-[14px] text-plum">Please sign in to confirm your appointment — it only takes a moment.</p>
          <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</LinkButton>
            <LinkButton to={`/register?next=${encodeURIComponent(location.pathname + location.search)}`} variant="outline">
              Create an account
            </LinkButton>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded bg-rose py-4 text-[13px] font-semibold uppercase tracking-wider text-white shadow-md transition-all hover:bg-rose-soft disabled:opacity-60"
        >
          <CalendarDays className="h-5 w-5" /> {submitting ? 'Reserving…' : 'Reserve Appointment'}
        </button>
      )}
      {!user && !needsLogin && (
        <p className="text-center text-[12.5px] text-plum">
          <Link to="/login" className="text-rose underline">
            Sign in
          </Link>{' '}
          to follow your booking status online.
        </p>
      )}
    </form>
  );
}

/** The full card used on the homepage and the Appointments page. */
export function BookingCard({ eyebrow, title, subtitle, relatedWork }: { eyebrow?: string | null; title: string; subtitle?: string | null; relatedWork?: { id: string; title: string } | null }) {
  return (
    <div className="mx-auto max-w-4xl rounded-3xl bg-blush-50 p-6 shadow-lg sm:p-8 lg:p-14">
      <div className="mx-auto mb-10 max-w-xl text-center">
        {eyebrow && <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-dark">{eyebrow}</span>}
        <h2 className="mt-1 text-[30px] font-medium text-rose sm:text-[40px] sm:leading-[48px]">{title}</h2>
        {subtitle && <p className="mt-2 text-[14px] text-plum">{subtitle}</p>}
      </div>
      <BookingForm relatedWork={relatedWork} />
    </div>
  );
}
