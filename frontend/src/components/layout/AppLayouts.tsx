import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  Bell,
  CalendarDays,
  ExternalLink,
  Heart,
  Home,
  Images,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  MessageSquareText,
  Palette,
  Scissors,
  Settings,
  Sparkles,
  Tags,
  User,
  Users,
  X,
  History,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { PageLoader } from '../ui';
import { Logo } from '../visual';

// ───────── Guards (UI only — the API enforces permissions independently) ─────────

export function RequireCustomer({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user || user.role !== 'ADMIN') return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

// ───────── Customer area ─────────

const CUSTOMER_NAV = [
  { to: '/customer/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/customer/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/customer/enquiries', label: 'Enquiries', icon: MessageSquareText },
  { to: '/customer/favorites', label: 'Favourites', icon: Heart },
  { to: '/customer/notifications', label: 'Notifications', icon: Bell },
  { to: '/customer/profile', label: 'Profile', icon: User },
];

export function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: notif } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => api.get<{ unread: number }>('/me/notifications'),
    refetchInterval: 60_000,
  });
  return (
    <div className="min-h-screen bg-cream pb-16 pt-36 sm:pt-40">
      <div className="container-x">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow mb-2">My account</p>
            <h1 className="text-[32px] text-rose-deep sm:text-[40px]">Hello, {user?.name.split(' ')[0]}</h1>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 self-start text-[12px] font-semibold uppercase tracking-[0.1em] text-plum hover:text-rose-deep sm:self-auto"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
        <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
          <nav aria-label="Account" className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {CUSTOMER_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition lg:rounded-lg',
                    isActive ? 'bg-rose text-white shadow-[0_6px_16px_rgba(183,110,130,0.25)]' : 'bg-ivory text-brown ring-1 ring-beige hover:bg-blush-50',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {to.endsWith('notifications') && (notif?.unread ?? 0) > 0 && (
                  <span className="ml-auto rounded-full bg-gold px-1.5 text-[11px] text-white">{notif!.unread}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── Admin area ─────────

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/recent-work', label: 'Recent Work', icon: Sparkles },
  { to: '/admin/gallery', label: 'Gallery & Featured', icon: Images },
  { to: '/admin/services', label: 'Services', icon: Scissors },
  { to: '/admin/collections', label: 'Collections', icon: Layers },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/admin/enquiries', label: 'Enquiries', icon: MessageSquareText },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/homepage', label: 'Homepage', icon: Palette },
  { to: '/admin/activity', label: 'Activity Log', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<{ enquiries: { awaitingReply: number }; appointments: { pending: number; rescheduleRequests: number } }>('/admin/stats'),
    refetchInterval: 60_000,
  });
  const badges: Record<string, number> = {
    '/admin/enquiries': stats?.enquiries.awaitingReply ?? 0,
    '/admin/appointments': (stats?.appointments.pending ?? 0) + (stats?.appointments.rescheduleRequests ?? 0),
  };

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 px-3">
      {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition',
              isActive ? 'bg-rose/10 text-rose-deep' : 'text-brown/85 hover:bg-blush-50 hover:text-brown',
            )
          }
        >
          <Icon className="h-[18px] w-[18px]" />
          <span className="flex-1">{label}</span>
          {badges[to] > 0 && <span className="rounded-full bg-rose px-2 py-0.5 text-[11px] font-semibold text-white">{badges[to]}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-beige px-4 py-4">
      <p className="truncate text-[13px] font-semibold text-brown">{user?.name}</p>
      <p className="truncate text-[12px] text-plum/70">{user?.email}</p>
      <div className="mt-3 flex gap-2">
        <Link to="/" target="_blank" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-plum ring-1 ring-beige hover:bg-blush-50">
          <ExternalLink className="h-3.5 w-3.5" /> View site
        </Link>
        <button
          onClick={async () => {
            await logout();
            navigate('/admin/login');
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-plum ring-1 ring-beige hover:bg-blush-50"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fdf8f3]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col border-r border-beige bg-ivory lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo size="sm" />
          <span className="label-caps text-plum/70">Admin</span>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">{nav}</div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-beige bg-ivory/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open admin menu" className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-beige">
          <Menu className="h-5 w-5" />
        </button>
        <Logo size="sm" className="h-9" />
        <Link to="/" aria-label="View site" className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-beige">
          <Home className="h-4 w-4" />
        </Link>
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-brown/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-ivory shadow-xl"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <Logo size="sm" />
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="inline-flex h-10 w-10 items-center justify-center rounded-full">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              {footer}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main id="main" className="lg:pl-[250px]">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AdminPageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] text-brown sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-plum/80">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

