import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { CalendarHeart, Headset, Heart, Mail, MapPin, Menu, Phone, Search, User, X } from 'lucide-react';
import { Facebook, Instagram, Youtube } from '../SocialIcons';
import { useAuth } from '../../lib/auth';
import { useSite } from '../../lib/hooks';
import { useFavoriteIds } from '../visual';
import { LinkButton } from '../ui';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services' },
  { to: '/collections', label: 'Collections' },
  { to: '/recent-work', label: 'Recent Work' },
  { to: '/about', label: 'Our Story' },
  { to: '/appointments', label: 'Appointments' },
  { to: '/contact', label: 'Contact' },
];

/** The supplied SVSS Boutique logo (no extra text beside it). */
export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <img
      src="/brand/svss-logo-wordmark-sm.webp"
      srcSet="/brand/svss-logo-wordmark-sm.webp 477w, /brand/svss-logo-wordmark.webp 954w"
      sizes="120px"
      alt="SVSS Boutique"
      width={477}
      height={300}
      className={clsx('w-auto rounded object-contain ring-1 ring-gold/20', compact ? 'h-10' : 'h-14')}
    />
  );
}

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose();
    navigate(`/recent-work${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-start justify-center bg-brown/30 px-4 pt-32 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form
            role="search"
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: -12 }}
            animate={{ y: 0 }}
            className="flex w-full max-w-xl items-center gap-3 rounded-2xl bg-ivory p-3 shadow-2xl"
          >
            <Search className="ml-2 h-5 w-5 text-plum" />
            <label htmlFor="site-search" className="sr-only">
              Search designs
            </label>
            <input id="site-search" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bridal blouses, Maggam work…" className="flex-1 bg-transparent py-2 text-[15px] focus:outline-none" />
            <button type="submit" className="rounded-lg bg-rose px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-white">
              Search
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header() {
  const location = useLocation();
  const { user } = useAuth();
  const { data: site } = useSite();
  const { data: favs } = useFavoriteIds();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const accountTo = !user ? '/login' : user.role === 'ADMIN' ? '/admin/dashboard' : '/customer/dashboard';
  const accountLabel = !user ? 'Sign in' : user.role === 'ADMIN' ? 'Admin dashboard' : 'My account';
  const favCount = favs?.ids.length ?? 0;

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-cream/90 shadow-[0_1px_8px_rgba(73,54,58,0.06)] backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-ivory focus:px-3 focus:py-2">
        Skip to content
      </a>
      {site?.announcement && (
        <div className="bg-gold-dark px-4 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white sm:text-[11px]">
          <p className="truncate">{site.announcement}</p>
        </div>
      )}
      <div className="container-x flex h-20 items-center justify-between gap-6">
        <Link to="/" aria-label="SVSS Boutique home" className="shrink-0">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 xl:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'border-b py-1 text-[13px] uppercase tracking-wider transition-colors',
                  isActive ? 'border-rose font-semibold text-rose' : 'border-transparent font-semibold text-plum hover:text-brown',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => setSearch(true)} aria-label="Search designs" className="flex items-center justify-center p-2 text-plum transition-colors hover:text-brown">
            <Search className="h-[21px] w-[21px]" />
          </button>
          {user?.role !== 'ADMIN' && (
            <Link to={user ? '/customer/favorites' : '/login?next=/customer/favorites'} aria-label={`Saved favourites${favCount ? ` (${favCount})` : ''}`} className="relative flex items-center justify-center p-2 text-plum transition-colors hover:text-brown">
              <Heart className="h-[21px] w-[21px]" />
              {favCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-dark px-1 text-[10px] font-bold text-white">{favCount}</span>
              )}
            </Link>
          )}
          <Link to={accountTo} aria-label={accountLabel} title={accountLabel} className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-rose text-white transition hover:bg-rose-soft">
            {user ? <span className="text-[13px] font-semibold">{user.name.slice(0, 1).toUpperCase()}</span> : <User className="h-[17px] w-[17px]" />}
          </Link>
          <button
            type="button"
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-brown xl:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'calc(100dvh - 110px)' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-y-auto bg-cream xl:hidden"
          >
            <nav aria-label="Mobile" className="container-x flex flex-col py-6">
              {NAV.map((n, i) => (
                <motion.div key={n.to} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) => clsx('block border-b border-beige py-4 font-serif text-[24px]', isActive ? 'text-rose' : 'text-brown')}
                  >
                    {n.label}
                  </NavLink>
                </motion.div>
              ))}
              <LinkButton to="/appointments" size="lg" className="mt-8">
                <CalendarHeart className="h-4 w-4" /> Book an Appointment
              </LinkButton>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
    </header>
  );
}

function Footer() {
  const { data } = useSite();
  const b = data?.business;
  const socials = b
    ? ([
        ['Instagram', b.socials.instagram, Instagram],
        ['Facebook', b.socials.facebook, Facebook],
        ['YouTube', b.socials.youtube, Youtube],
      ] as const).filter(([, url]) => url)
    : [];
  const heading = 'mb-5 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-rose';
  const linkCls = 'text-[14px] text-plum transition-colors hover:text-rose';
  return (
    <footer className="mt-auto bg-blush-50">
      <div className="container-x grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
        <div>
          <p className="font-serif text-[26px] uppercase tracking-tight text-rose">{b?.name ?? 'SVSS Boutique'}</p>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-plum">{data?.footerBlurb || b?.tagline}</p>
          {socials.length > 0 && (
            <div className="mt-6 flex gap-2">
              {socials.map(([label, url, Icon]) => (
                <a key={label} href={url!} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-full bg-blush-100 text-rose transition hover:bg-rose hover:text-white">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className={heading}>Our Craft</h2>
          <ul className="space-y-3">
            {(data?.services ?? []).slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link to={`/services/${s.slug}`} className={linkCls}>
                  {s.title}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/collections" className={linkCls}>
                Collections
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className={heading}>Client Concierge</h2>
          <ul className="space-y-3">
            {[
              ['/appointments', 'Book an Appointment'],
              ['/contact', 'Send an Enquiry'],
              ['/recent-work', 'Recent Work'],
              ['/about', 'Our Story'],
              ['/login', 'My Account'],
            ].map(([to, l]) => (
              <li key={to}>
                <Link to={to} className={linkCls}>
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>Visit the Studio</h2>
          <ul className="space-y-3 text-[14px] text-plum">
            {b?.phone && (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="hover:text-rose">
                  {b.phone}
                </a>
              </li>
            )}
            {b?.email && (
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                <a href={`mailto:${b.email}`} className="break-all hover:text-rose">
                  {b.email}
                </a>
              </li>
            )}
            {b?.address && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />
                <span className="whitespace-pre-line">{b.address}</span>
              </li>
            )}
            {!b?.phone && !b?.email && !b?.address && (
              <li>
                <Link to="/contact" className="hover:text-rose">
                  Send us a message →
                </Link>
              </li>
            )}
          </ul>
          <Link to="/appointments" className="mt-5 flex w-full items-center justify-center rounded bg-gold-dark px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#5b4312]">
            Book a Consultation
          </Link>
        </div>
      </div>
      <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-[12px] text-plum sm:flex-row">
        <p>
          © {new Date().getFullYear()} {b?.name ?? 'SVSS Boutique'}. All rights reserved.
        </p>
        <div className="flex gap-6 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <Link to="/contact" className="hover:text-rose">
            Contact
          </Link>
          <Link to="/appointments" className="hover:text-rose">
            Appointments
          </Link>
        </div>
      </div>
    </footer>
  );
}

function StylistButton() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/appointments')) return null;
  return (
    <Link
      to="/appointments"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-xl bg-ivory px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-rose shadow-[0_8px_24px_rgba(73,54,58,0.15)] transition hover:-translate-y-0.5"
    >
      <Headset className="h-4 w-4" /> Bespoke Stylist
    </Link>
  );
}

export function PublicLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <StylistButton />
    </div>
  );
}
