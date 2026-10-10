import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, Circle, FileEdit, Layers, MessageSquareWarning, Plus, Sparkles, Tags, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDateTime, relativeTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, LinkButton, PageLoader, StatusBadge } from '../../components/ui';

interface Stats {
  timezone: string;
  work: { published: number; drafts: number };
  categories: number;
  collections: number;
  customers: number;
  enquiries: { new: number; awaitingReply: number };
  appointments: { pending: number; confirmedUpcoming: number; today: number; rescheduleRequests: number };
  upcoming: { id: string; reference: string; name: string; serviceTitle: string; startAt: string; status: string }[];
  recentActivity: ActivityItem[];
  setup: { hasWorkingHours: boolean; hasContactInfo: boolean; emailConfigured: boolean; storage: string };
}
export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actor: string | null;
  createdAt: string;
}

function StatCard({ label, value, icon: Icon, to, tone = 'default' }: { label: string; value: number; icon: typeof Users; to: string; tone?: 'default' | 'alert' }) {
  return (
    <Link to={to} className={clsx('flex items-center gap-4 rounded-xl border bg-ivory p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]', tone === 'alert' && value > 0 ? 'border-rose/40' : 'border-beige')}>
      <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', tone === 'alert' && value > 0 ? 'bg-rose text-white' : 'bg-blush-50 text-rose')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-[28px] leading-none">{value}</span>
        <span className="text-[12.5px] text-plum/80">{label}</span>
      </span>
    </Link>
  );
}

export function AdminDashboard() {
  useDocumentTitle('Admin dashboard');
  const { data: s, isLoading, error } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<Stats>('/admin/stats') });
  if (isLoading) return <PageLoader />;
  if (error || !s) return <Alert tone="error">Could not load the dashboard.</Alert>;
  const tasks = [
    { n: s.enquiries.awaitingReply, label: 'enquiries waiting for a reply', to: '/admin/enquiries' },
    { n: s.appointments.pending, label: 'appointment requests to confirm', to: '/admin/appointments' },
    { n: s.appointments.rescheduleRequests, label: 'reschedule requests', to: '/admin/appointments?status=requests' },
    { n: s.work.drafts, label: 'draft designs not yet published', to: '/admin/recent-work?status=DRAFT' },
  ].filter((t) => t.n > 0);
  const setup = [
    { done: s.setup.hasContactInfo, label: 'Add phone/email & address', to: '/admin/settings' },
    { done: s.setup.hasWorkingHours, label: 'Set working hours so customers can book', to: '/admin/appointments?tab=availability' },
    { done: s.work.published > 0, label: 'Publish your first Recent Work design', to: '/admin/recent-work/new' },
  ];
  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        subtitle="Live overview of your boutique"
        actions={
          <LinkButton to="/admin/recent-work/new">
            <Plus className="h-4 w-4" /> Add new work
          </LinkButton>
        }
      />
      {setup.some((x) => !x.done) && (
        <div className="mb-6 rounded-xl border border-gold/40 bg-[#fbf5ea] p-5">
          <h2 className="text-[18px]">Finish setting up</h2>
          <ul className="mt-3 space-y-2">
            {setup.map((x) => (
              <li key={x.label} className="flex items-center gap-2 text-[14px]">
                {x.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-gold" />}
                {x.done ? <span className="text-plum/60 line-through">{x.label}</span> : <Link to={x.to} className="underline">{x.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Published designs" value={s.work.published} icon={Sparkles} to="/admin/recent-work?status=PUBLISHED" />
        <StatCard label="Drafts" value={s.work.drafts} icon={FileEdit} to="/admin/recent-work?status=DRAFT" />
        <StatCard label="New enquiries" value={s.enquiries.new} icon={MessageSquareWarning} to="/admin/enquiries" tone="alert" />
        <StatCard label="Awaiting reply" value={s.enquiries.awaitingReply} icon={MessageSquareWarning} to="/admin/enquiries?status=awaiting" tone="alert" />
        <StatCard label="Pending appointments" value={s.appointments.pending} icon={CalendarClock} to="/admin/appointments?status=PENDING" tone="alert" />
        <StatCard label="Confirmed upcoming" value={s.appointments.confirmedUpcoming} icon={CalendarClock} to="/admin/appointments?status=CONFIRMED" />
        <StatCard label="Customers" value={s.customers} icon={Users} to="/admin/customers" />
        <StatCard label="Categories · Collections" value={s.categories + s.collections} icon={Tags} to="/admin/categories" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-beige bg-ivory p-5">
          <h2 className="mb-3 text-[20px]">To do</h2>
          {tasks.length ? (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.label}>
                  <Link to={t.to} className="flex items-center justify-between rounded-lg bg-cream px-4 py-3 text-[14px] hover:bg-blush-50">
                    <span>
                      <strong className="font-semibold">{t.n}</strong> {t.label}
                    </span>
                    <span className="text-rose-deep">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-plum/80">All caught up. 🌸</p>
          )}
          <h2 className="mb-3 mt-6 text-[20px]">Next 7 days</h2>
          {s.upcoming.length ? (
            <ul className="divide-y divide-beige">
              {s.upcoming.map((a) => (
                <li key={a.id}>
                  <Link to={`/admin/appointments?id=${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:text-rose-deep">
                    <span>
                      <span className="font-semibold">{a.name}</span> · <span className="text-plum/80">{a.serviceTitle}</span>
                      <span className="block text-[13px] text-plum/70">{fmtDateTime(a.startAt, s.timezone)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-plum/80">No appointments in the next week.</p>
          )}
        </section>
        <section className="rounded-xl border border-beige bg-ivory p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[20px]">Recent activity</h2>
            <Link to="/admin/activity" className="text-[13px] text-rose-deep underline">
              Full log
            </Link>
          </div>
          <ActivityList items={s.recentActivity} />
        </section>
      </div>
      <p className="mt-6 flex items-center gap-2 text-[12px] text-plum/60">
        <Layers className="h-3.5 w-3.5" /> Storage: {s.setup.storage === 's3' ? 'S3 object storage' : 'local disk (development)'} · Email {s.setup.emailConfigured ? 'configured' : 'not configured — communication stays in-app'}
      </p>
    </>
  );
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <p className="text-[14px] text-plum/80">Nothing yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((l) => (
        <li key={l.id} className="flex gap-3 text-[14px]">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
          <div>
            <p>{l.summary}</p>
            <p className="text-[12px] text-plum/65">
              {l.actor ?? 'System'} · <time dateTime={l.createdAt} title={new Date(l.createdAt).toLocaleString()}>{relativeTime(l.createdAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminActivity() {
  useDocumentTitle('Activity log');
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'activity', page, type],
    queryFn: () => api.get<{ total: number; items: ActivityItem[] }>(`/admin/activity?page=${page}&limit=50${type ? `&entityType=${type}` : ''}`),
  });
  return (
    <>
      <AdminPageHeader title="Activity log" subtitle="Publishing, content edits and appointment changes, with time and admin." />
      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'RecentWork', 'Service', 'Collection', 'Category', 'Homepage', 'Appointment', 'Enquiry', 'Settings', 'Availability', 'User'].map((t) => (
          <button
            key={t}
            onClick={() => {
              setType(t);
              setPage(1);
            }}
            className={clsx('rounded-full border px-3 py-1.5 text-[12px] font-semibold', type === t ? 'border-rose bg-rose text-white' : 'border-beige bg-ivory')}
          >
            {t || 'All'}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-beige bg-ivory">
        {isLoading || !data ? (
          <PageLoader />
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-beige text-[11px] uppercase tracking-[0.08em] text-plum/70">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">What</th>
                <th className="hidden px-4 py-3 sm:table-cell">Who</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige">
              {data.items.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-plum/80">{new Date(l.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-4 py-3">
                    {l.summary}
                    <span className="block text-[12px] text-plum/60 sm:hidden">{l.actor ?? 'System'}</span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{l.actor ?? 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 50 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-[13px]">
            Page {page} of {Math.ceil(data.total / 50)}
          </span>
          <Button size="sm" variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
