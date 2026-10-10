import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus, Send, X } from 'lucide-react';
import { ApiError, uploadWithProgress } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSite } from '../lib/hooks';
import { Alert, Button, Input, LinkButton, Select, Textarea } from './ui';

const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024;

export function EnquiryForm({
  defaultServiceId,
  relatedWork,
  compact,
}: {
  defaultServiceId?: string;
  relatedWork?: { id: string; title: string } | null;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { data: site } = useSite();
  const location = useLocation();
  const qc = useQueryClient();
  const startedAt = useRef(Date.now());
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: '',
    phone: user?.phone ?? '',
    serviceId: defaultServiceId ?? '',
    subject: relatedWork ? `Similar design: ${relatedWork.title}` : '',
    message: '',
    website: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ reference: string; linked: boolean } | null>(null);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, phone: f.phone || user.phone || '' }));
  }, [user]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  if (user?.role === 'ADMIN') {
    return <Alert>You are signed in as an administrator. Enquiries are sent from customer accounts.</Alert>;
  }
  if (!user && site && !site.enquiries.allowGuests) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <div className="card p-6 text-center sm:p-8">
        <h3 className="text-2xl">Sign in to send an enquiry</h3>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] text-plum/85">
          Your enquiries and our replies are kept together in your account, so nothing gets lost.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton to={`/login?next=${next}`}>Sign in</LinkButton>
          <LinkButton to={`/register?next=${next}`} variant="outline">
            Create an account
          </LinkButton>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center p-8 text-center" role="status">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="mt-3 text-2xl">Thank you — your enquiry has been received</h3>
        <p className="mt-2 text-[14.5px] text-plum/85">
          Reference <strong className="font-semibold text-brown">{done.reference}</strong>.{' '}
          {done.linked ? 'You can follow the conversation in your account.' : 'We will reply using the contact details you gave.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {done.linked && <LinkButton to="/customer/enquiries">View my enquiries</LinkButton>}
          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setForm((f) => ({ ...f, subject: '', message: '' }));
              setFiles([]);
              startedAt.current = Date.now();
            }}
          >
            Send another
          </Button>
        </div>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
        setError(`“${f.name}” is not a supported image. Use JPG, PNG, WebP or HEIC.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`“${f.name}” is larger than 8 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} images.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (user && k === 'email') return;
      fd.append(k, v);
    });
    if (relatedWork) fd.append('relatedWorkId', relatedWork.id);
    if (!form.serviceId) fd.delete('serviceId');
    fd.append('startedAt', String(startedAt.current));
    files.forEach((f) => fd.append('images', f));
    setProgress(0);
    try {
      const res = await uploadWithProgress<{ enquiry: { reference: string; linkedToAccount: boolean } }>('/enquiries', fd, setProgress);
      setDone({ reference: res.enquiry.reference, linked: res.enquiry.linkedToAccount });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else setError('Your enquiry could not be sent. Please try again.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? 'space-y-4' : 'card space-y-5 p-5 sm:p-8'} noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {relatedWork && (
        <p className="rounded-md bg-blush-50 px-4 py-2.5 text-[13.5px] text-rose-deep">
          About the design: <strong className="font-semibold">{relatedWork.title}</strong>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" required value={form.name} onChange={set('name')} error={fieldErrors.name} autoComplete="name" maxLength={80} />
        {user ? (
          <Input label="Email" value={user.email} disabled hint="Replies appear in your account" />
        ) : (
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} autoComplete="email" hint="Email or phone is required" />
        )}
        <Input label="Phone / WhatsApp" type="tel" value={form.phone} onChange={set('phone')} error={fieldErrors.phone} autoComplete="tel" />
        <Select label="Service" value={form.serviceId} onChange={set('serviceId')}>
          <option value="">Not sure / general question</option>
          {site?.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </Select>
      </div>
      <Input label="Subject" required value={form.subject} onChange={set('subject')} error={fieldErrors.subject} maxLength={150} />
      <Textarea
        label="Message"
        required
        rows={compact ? 4 : 6}
        value={form.message}
        onChange={set('message')}
        error={fieldErrors.message}
        maxLength={4000}
        placeholder="Tell us about the occasion, colours, fabric, timeline or anything else you have in mind…"
      />
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">Reference images (optional)</p>
        <div className="flex flex-wrap gap-3">
          {previews.map((src, i) => (
            <div key={src} className="relative h-20 w-20 overflow-hidden rounded-md ring-1 ring-beige">
              <img src={src} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                aria-label={`Remove reference ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-ivory/90 p-0.5 text-brown"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {files.length < MAX_FILES && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gold/60 text-[11px] text-plum transition hover:bg-gold/5 focus-within:ring-2 focus-within:ring-gold/40">
              <ImagePlus className="h-5 w-5 text-gold" />
              Add
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-[12px] text-plum/70">Up to 4 images, 8 MB each. Only you and the boutique can see them.</p>
      </div>
      {/* honeypot: hidden from people, tempting for bots */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
        </label>
      </div>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={progress !== null}>
          <Send className="h-4 w-4" /> {progress !== null && files.length ? `Sending ${progress}%` : 'Send enquiry'}
        </Button>
        {!user && (
          <p className="text-[12.5px] text-plum/75">
            Have an account? <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="text-rose-deep underline">Sign in</Link> to track replies.
          </p>
        )}
      </div>
    </form>
  );
}
