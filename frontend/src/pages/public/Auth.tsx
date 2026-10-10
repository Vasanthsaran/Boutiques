import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { Alert, Button, Input, PageLoader } from '../../components/ui';
import { Logo, Motif } from '../../components/visual';

function safeNext(raw: string | null, fallback: string) {
  // Only allow same-site relative paths (prevents open redirects).
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return fallback;
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex min-h-screen items-center justify-center bg-blush-50 px-4 pb-16 pt-40">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-9">
          <div className="mb-6 text-center">
            <Motif className="mx-auto h-6 w-9 text-gold" />
            <h1 className="mt-2 text-[30px] text-rose-deep">{title}</h1>
            {subtitle && <p className="mt-2 text-[14.5px] text-plum/80">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-[14px] text-plum">{footer}</div>}
      </div>
    </section>
  );
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = safeNext(params.get('next'), '/customer/dashboard');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>('/auth/login', form);
      setUser(res.user);
      qc.invalidateQueries();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage appointments, enquiries and favourites."
      footer={
        <>
          New here?{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-rose-deep underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-[13px] text-rose-deep underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  useDocumentTitle('Create account');
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const next = safeNext(params.get('next'), '/customer/dashboard');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    if (form.password !== form.confirm) {
      setErrors({ confirm: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>('/auth/register', { name: form.name, email: form.email, phone: form.phone, password: form.password });
      setUser(res.user);
      qc.invalidateQueries();
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fields);
      } else setError('Registration failed.');
    } finally {
      setLoading(false);
    }
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthShell
      title="Create your account"
      subtitle="Book appointments, follow your enquiries and save designs you love."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-rose-deep underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Full name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Mobile (optional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
        <Input label="Password" type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
        <Input label="Confirm password" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ message: string; emailEnabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setResult(await api.post<{ message: string; emailEnabled: boolean }>('/auth/forgot-password', { email }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you registered with." footer={<Link to="/login" className="text-rose-deep underline">Back to sign in</Link>}>
      {result ? (
        <Alert tone={result.emailEnabled ? 'success' : 'info'}>
          {result.message}
          {!result.emailEnabled && (
            <>
              {' '}
              <Link to="/contact" className="underline">
                Contact us
              </Link>
            </>
          )}
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.password !== pw.confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: pw.password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell title="Choose a new password">
      {!token ? (
        <Alert tone="error">This link is incomplete. Please request a new reset link.</Alert>
      ) : done ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <p className="mt-3">Your password has been updated.</p>
          <Link to="/login" className="mt-5 inline-block font-semibold text-rose-deep underline">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="New password" type="password" autoComplete="new-password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} hint="At least 8 characters" />
          <Input label="Confirm password" type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('This link is incomplete.');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        refresh();
      })
      .catch((err) => {
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed.');
      });
  }, [params, refresh]);
  return (
    <AuthShell title="Email verification">
      {state === 'loading' ? <PageLoader /> : state === 'ok' ? <Alert tone="success">Thank you — your email is verified.</Alert> : <Alert tone="error">{message}</Alert>}
    </AuthShell>
  );
}

export function AdminLoginPage() {
  useDocumentTitle('Admin sign in');
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = safeNext(params.get('next'), '/admin/dashboard');
  if (user?.role === 'ADMIN') return <Navigate to={next.startsWith('/admin') ? next : '/admin/dashboard'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (user) await api.post('/auth/logout'); // switch from a customer session
      const res = await api.post<{ user: User }>('/auth/admin/login', form);
      setUser(res.user);
      qc.invalidateQueries();
      navigate(next.startsWith('/admin') ? next : '/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="flex min-h-screen items-center justify-center bg-[#fdf8f3] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="card p-7">
          <h1 className="flex items-center gap-2 text-[24px]">
            <ShieldCheck className="h-6 w-6 text-gold" /> Admin sign in
          </h1>
          <p className="mt-1 text-[13.5px] text-plum/75">For boutique staff only.</p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Input label="Email" type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button type="submit" variant="dark" size="lg" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>
        <p className="mt-5 text-center text-[13px]">
          <Link to="/" className="text-plum underline">
            Back to website
          </Link>
        </p>
      </div>
    </section>
  );
}
