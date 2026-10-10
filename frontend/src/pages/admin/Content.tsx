import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, Trash2, Undo2, Upload } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { relativeTime } from '../../lib/format';
import type { Business, HomeContent, HomeData, Media } from '../../lib/types';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, ConfirmDialog, Input, Modal, PageLoader, Select, StatusBadge, Textarea, Toggle, useToast } from '../../components/ui';
import { SingleImageField } from '../../components/admin/MediaUploader';
import { HomeView } from '../public/Home';

// ═════════════ Homepage ═════════════

interface HomepageRecord {
  draft: HomeContent;
  published: HomeContent;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  assets: Record<string, Media>;
}

const SECTION_LABELS: Record<keyof HomeContent['sections'], string> = {
  services: 'Services',
  featuredWork: 'Featured recent work',
  collections: 'Collections',
  process: 'How custom designing works',
  about: 'About',
  booking: 'Appointment booking',
  testimonials: 'Testimonials (only shows if you add some)',
  contact: 'Contact',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-beige bg-ivory p-5">
      <h2 className="text-[19px]">{title}</h2>
      {children}
    </section>
  );
}

export function AdminHomepage() {
  useDocumentTitle('Homepage');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'homepage'], queryFn: () => api.get<HomepageRecord>('/admin/homepage') });
  const collections = useQuery({ queryKey: ['admin', 'collections'], queryFn: () => api.get<{ collections: { id: string; title: string; status: string }[] }>('/admin/collections') });
  const [c, setC] = useState<HomeContent | null>(null);
  const [images, setImages] = useState<Record<string, Media | null>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<HomeData | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  useEffect(() => {
    if (data) {
      setC(data.draft);
      setImages({
        hero: data.draft.hero.imageId ? data.assets[data.draft.hero.imageId] ?? null : null,
        about: data.draft.about.imageId ? data.assets[data.draft.about.imageId] ?? null : null,
      });
      setDirty(false);
    }
  }, [data]);

  const saveDraft = useMutation({
    mutationFn: () => api.put('/admin/homepage/draft', c),
    onSuccess: () => {
      setDirty(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ['admin', 'homepage'] });
      toast('Draft saved — not live yet');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save'),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await api.put('/admin/homepage/draft', c);
      await api.post('/admin/homepage/publish');
    },
    onSuccess: () => {
      setDirty(false);
      setConfirmPublish(false);
      qc.invalidateQueries({ queryKey: ['admin', 'homepage'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      toast('Homepage published');
    },
    onError: (e) => {
      setConfirmPublish(false);
      setError(errorMessage(e));
    },
  });
  const discard = useMutation({
    mutationFn: () => api.post('/admin/homepage/discard'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'homepage'] });
      toast('Draft reset to the live version');
    },
  });
  const openPreview = useMutation({
    mutationFn: async () => {
      if (dirty) await api.put('/admin/homepage/draft', c);
      return api.get<HomeData>('/admin/homepage/preview');
    },
    onSuccess: (d) => {
      setDirty(false);
      setPreview(d);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (isLoading || !c || !data) return <PageLoader />;
  const upd = (fn: (d: HomeContent) => HomeContent) => {
    setC(fn(structuredClone(c)));
    setDirty(true);
  };
  const setImg = (slot: 'hero' | 'about', m: Media | null) => {
    setImages({ ...images, [slot]: m });
    upd((d) => {
      d[slot].imageId = m?.id ?? null;
      return d;
    });
  };
  const hasUnpublished = JSON.stringify(data.draft) !== JSON.stringify(data.published) || dirty;

  return (
    <>
      <AdminPageHeader
        title="Homepage"
        subtitle={
          <>
            Edit, preview, then publish. Live version {data.publishedAt ? `published ${relativeTime(data.publishedAt)}` : 'uses the default content'}.
            {hasUnpublished && <span className="ml-2 font-semibold text-warning">You have unpublished changes.</span>}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => discard.mutate()} disabled={!hasUnpublished} loading={discard.isPending}>
              <Undo2 className="h-4 w-4" /> Discard draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveDraft.mutate()} disabled={!dirty} loading={saveDraft.isPending}>
              Save draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => openPreview.mutate()} loading={openPreview.isPending}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button size="sm" onClick={() => setConfirmPublish(true)} disabled={!hasUnpublished}>
              <Upload className="h-4 w-4" /> Publish
            </Button>
          </>
        }
      />
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Announcement bar & hero">
          <Input label="Announcement bar (top strip)" value={c.announcement ?? ''} onChange={(e) => upd((d) => ((d.announcement = e.target.value), d))} hint="Leave empty to hide the strip. Only state things that are true." />
          <Input label="Small label above headline" value={c.hero.eyebrow ?? ''} onChange={(e) => upd((d) => ((d.hero.eyebrow = e.target.value), d))} />
          <Input label="Headline" value={c.hero.headline} onChange={(e) => upd((d) => ((d.hero.headline = e.target.value), d))} />
          <Textarea label="Subtext" rows={3} value={c.hero.subtext} onChange={(e) => upd((d) => ((d.hero.subtext = e.target.value), d))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Primary button" value={c.hero.primaryCtaLabel} onChange={(e) => upd((d) => ((d.hero.primaryCtaLabel = e.target.value), d))} hint="Links to Recent Work" />
            <Input label="Secondary button" value={c.hero.secondaryCtaLabel} onChange={(e) => upd((d) => ((d.hero.secondaryCtaLabel = e.target.value), d))} hint="Links to booking" />
          </div>
          <Input
            label="Highlights under the buttons (comma separated, up to 4)"
            value={c.hero.features.join(', ')}
            onChange={(e) => upd((d) => ((d.hero.features = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4)), d))}
          />
          <Toggle label="3D floating petals" description="Lightweight 3D petals over the hero photo (CSS petals on low-power devices)." checked={c.hero.show3d} onChange={(v) => upd((d) => ((d.hero.show3d = v), d))} />
          <SingleImageField label="Hero background photo" value={images.hero ?? null} onChange={(m) => setImg('hero', m)} hint="A wide photo works best. Until you upload one, the design’s default photo is used." ratio="16/9" />
        </Panel>
        <Panel title="Sections shown">
          {(Object.keys(SECTION_LABELS) as (keyof HomeContent['sections'])[]).map((k) => (
            <Toggle key={k} label={SECTION_LABELS[k]} checked={c.sections[k]} onChange={(v) => upd((d) => ((d.sections[k] = v), d))} />
          ))}
        </Panel>
        <Panel title="Section headings">
          {(['services', 'featuredWork', 'collections', 'booking', 'testimonials', 'contact'] as const).map((k) => (
            <div key={k} className="grid gap-3 sm:grid-cols-2">
              <Input label={`${SECTION_LABELS[k].split(' (')[0]} — title`} value={c[k].title} onChange={(e) => upd((d) => ((d[k].title = e.target.value), d))} />
              <Input label="Subtitle" value={c[k].subtitle ?? ''} onChange={(e) => upd((d) => ((d[k].subtitle = e.target.value), d))} />
            </div>
          ))}
          <Input label="Booking section — small label" value={c.booking.eyebrow ?? ''} onChange={(e) => upd((d) => ((d.booking.eyebrow = e.target.value), d))} />
          <Select label="Number of featured designs" value={c.featuredWork.limit} onChange={(e) => upd((d) => ((d.featuredWork.limit = Number(e.target.value)), d))}>
            {[3, 6, 9, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">Collections on homepage</legend>
            <p className="mb-2 text-[12.5px] text-plum/70">Leave all unticked to show collections marked “featured”.</p>
            <div className="space-y-1.5">
              {collections.data?.collections.map((col) => (
                <label key={col.id} className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#B76E82]"
                    checked={c.collections.collectionIds.includes(col.id)}
                    onChange={(e) =>
                      upd((d) => {
                        d.collections.collectionIds = e.target.checked ? [...d.collections.collectionIds, col.id] : d.collections.collectionIds.filter((x) => x !== col.id);
                        return d;
                      })
                    }
                  />
                  {col.title} {col.status === 'DRAFT' && <span className="text-[12px] text-plum/60">(draft)</span>}
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <Panel title="How custom designing works">
          <Input label="Title" value={c.process.title} onChange={(e) => upd((d) => ((d.process.title = e.target.value), d))} />
          {c.process.steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-beige p-3">
              <div className="flex items-end gap-2">
                <Input label={`Step ${i + 1}`} value={s.title} onChange={(e) => upd((d) => ((d.process.steps[i].title = e.target.value), d))} wrapClassName="flex-1" />
                <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => upd((d) => ((d.process.steps = d.process.steps.filter((_, j) => j !== i)), d))}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
              <Textarea aria-label={`Step ${i + 1} text`} rows={2} value={s.body} onChange={(e) => upd((d) => ((d.process.steps[i].body = e.target.value), d))} wrapClassName="mt-2" />
            </div>
          ))}
          {c.process.steps.length < 6 && (
            <Button size="sm" variant="ghost" onClick={() => upd((d) => (d.process.steps.push({ title: 'New step', body: '' }), d))}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          )}
        </Panel>
        <Panel title="About">
          <Input label="Label" value={c.about.eyebrow ?? ''} onChange={(e) => upd((d) => ((d.about.eyebrow = e.target.value), d))} />
          <Input label="Title" value={c.about.title} onChange={(e) => upd((d) => ((d.about.title = e.target.value), d))} />
          <Textarea label="Your story" rows={7} value={c.about.body} onChange={(e) => upd((d) => ((d.about.body = e.target.value), d))} hint="Use a blank line between paragraphs. Also shown on the About page." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Badge title" value={c.about.badgeTitle ?? ''} onChange={(e) => upd((d) => ((d.about.badgeTitle = e.target.value), d))} />
            <Input label="Badge text" value={c.about.badgeText ?? ''} onChange={(e) => upd((d) => ((d.about.badgeText = e.target.value), d))} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.08em]">Figures (optional — only real numbers, e.g. “12 years”)</legend>
            {c.about.stats.map((st, i) => (
              <div key={i} className="flex items-end gap-2">
                <Input aria-label={`Figure ${i + 1} value`} value={st.value} onChange={(e) => upd((d) => ((d.about.stats[i].value = e.target.value), d))} wrapClassName="w-1/3" />
                <Input aria-label={`Figure ${i + 1} label`} value={st.label} onChange={(e) => upd((d) => ((d.about.stats[i].label = e.target.value), d))} wrapClassName="flex-1" />
                <Button size="sm" variant="ghost" aria-label="Remove figure" onClick={() => upd((d) => ((d.about.stats = d.about.stats.filter((_, j) => j !== i)), d))}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
            {c.about.stats.length < 3 && (
              <Button size="sm" variant="ghost" onClick={() => upd((d) => (d.about.stats.push({ value: '', label: '' }), d))}>
                <Plus className="h-4 w-4" /> Add figure
              </Button>
            )}
          </fieldset>
          <SingleImageField label="Image" value={images.about ?? null} onChange={(m) => setImg('about', m)} />
        </Panel>
        <Panel title="Footer">
          <Textarea label="Footer text (optional)" rows={2} value={c.footer.blurb ?? ''} onChange={(e) => upd((d) => ((d.footer.blurb = e.target.value), d))} />
        </Panel>
      </div>
      <div className="mt-8">
        <Testimonials />
      </div>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Homepage preview (draft)" size="xl">
        {preview && (
          <div className="-mx-5 -my-5 bg-cream">
            <HomeView data={preview} preview />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmPublish}
        title="Publish homepage?"
        message="Your draft will replace the live homepage immediately."
        confirmLabel="Publish"
        tone="primary"
        loading={publish.isPending}
        onConfirm={() => publish.mutate()}
        onClose={() => setConfirmPublish(false)}
      />
    </>
  );
}

// ═════════════ Testimonials ═════════════

interface Testimonial {
  id: string;
  name: string;
  context: string | null;
  text: string;
  status: 'DRAFT' | 'PUBLISHED';
}

function Testimonials() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['admin', 'testimonials'], queryFn: () => api.get<{ testimonials: Testimonial[] }>('/admin/testimonials') });
  const [editing, setEditing] = useState<Testimonial | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', context: '', text: '', status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (editing && editing !== 'new') setForm({ name: editing.name, context: editing.context ?? '', text: editing.text, status: editing.status });
    if (editing === 'new') setForm({ name: '', context: '', text: '', status: 'PUBLISHED' });
    setErr(null);
  }, [editing]);
  const save = useMutation({
    mutationFn: () => (editing === 'new' ? api.post('/admin/testimonials', form) : api.put(`/admin/testimonials/${(editing as Testimonial).id}`, form)),
    onSuccess: () => {
      toast('Testimonial saved');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'testimonials'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/testimonials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'testimonials'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
  return (
    <Panel title="Testimonials">
      <Alert>Only add genuine words from real customers, with their permission.</Alert>
      <ul className="divide-y divide-beige">
        {data?.testimonials.map((t) => (
          <li key={t.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {t.name} {t.context && <span className="font-normal text-plum/70">· {t.context}</span>}
              </p>
              <p className="line-clamp-2 text-[13.5px] text-plum/85">“{t.text}”</p>
            </div>
            <StatusBadge status={t.status} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)} aria-label="Delete">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
        <Plus className="h-4 w-4" /> Add testimonial
      </Button>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New testimonial' : 'Edit testimonial'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <Alert tone="error">{err}</Alert>}
          <Input label="Customer name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Context (optional)" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} placeholder="e.g. Bridal blouse" />
          <Textarea label="Their words" required rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          <Select label="Visibility" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'DRAFT' | 'PUBLISHED' })}>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Hidden</option>
          </Select>
        </div>
      </Modal>
    </Panel>
  );
}

// ═════════════ Settings ═════════════

export function AdminSettings() {
  useDocumentTitle('Settings');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<{ business: Business; enquiries: { allowGuests: boolean }; emailConfigured: boolean; storage: string }>('/admin/settings'),
  });
  const [b, setB] = useState<Business | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setB(data.business);
  }, [data]);
  const saveBusiness = useMutation({
    mutationFn: () => api.put('/admin/settings/business', b),
    onSuccess: () => {
      toast('Business details saved');
      setErr(null);
      setErrors({});
      qc.invalidateQueries({ queryKey: ['site'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => {
      setErr(errorMessage(e));
      if (e instanceof ApiError) setErrors(e.fields);
    },
  });
  const saveEnq = useMutation({
    mutationFn: (allowGuests: boolean) => api.put('/admin/settings/enquiries', { allowGuests }),
    onSuccess: () => {
      toast('Saved');
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      qc.invalidateQueries({ queryKey: ['site'] });
    },
  });
  if (isLoading || !b || !data) return <PageLoader />;
  const set = (k: keyof Business, v: string) => setB({ ...b, [k]: v });
  const setSocial = (k: keyof Business['socials'], v: string) => setB({ ...b, socials: { ...b.socials, [k]: v } });
  return (
    <>
      <AdminPageHeader title="Settings" subtitle="Business details shown on the website. Only enter real information — empty fields are simply hidden." />
      {err && (
        <Alert tone="error" className="mb-4">
          {err}
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Business & contact">
          <Input label="Business name" value={b.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Input label="Tagline" value={b.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={b.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            <Input label="WhatsApp number" value={b.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} hint="With country code, e.g. +91…" />
          </div>
          <Input label="Email" type="email" value={b.email ?? ''} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <Textarea label="Address" rows={3} value={b.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          <Textarea label="Opening hours (shown on Contact page)" rows={3} value={b.hours ?? ''} onChange={(e) => set('hours', e.target.value)} hint="Booking slots are set separately under Appointments → Hours." />
        </Panel>
        <Panel title="Map & social links">
          <Input label="Google Maps embed URL" value={b.mapEmbedUrl ?? ''} onChange={(e) => set('mapEmbedUrl', e.target.value)} error={errors.mapEmbedUrl} hint="Google Maps → Share → Embed a map → copy the src link (https://www.google.com/maps/embed?...)" />
          <Input label="Google Maps link" value={b.mapLink ?? ''} onChange={(e) => set('mapLink', e.target.value)} error={errors.mapLink} />
          <Input label="Instagram" value={b.socials.instagram ?? ''} onChange={(e) => setSocial('instagram', e.target.value)} error={errors['socials.instagram']} placeholder="https://instagram.com/…" />
          <Input label="Facebook" value={b.socials.facebook ?? ''} onChange={(e) => setSocial('facebook', e.target.value)} error={errors['socials.facebook']} />
          <Input label="YouTube" value={b.socials.youtube ?? ''} onChange={(e) => setSocial('youtube', e.target.value)} error={errors['socials.youtube']} />
          <Input label="Pinterest" value={b.socials.pinterest ?? ''} onChange={(e) => setSocial('pinterest', e.target.value)} error={errors['socials.pinterest']} />
        </Panel>
      </div>
      <Button className="mt-4" loading={saveBusiness.isPending} onClick={() => saveBusiness.mutate()}>
        Save business details
      </Button>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Enquiries">
          <Toggle
            label="Allow guest enquiries"
            description="Visitors without an account can send enquiries (spam-protected). Off: they are asked to sign in."
            checked={data.enquiries.allowGuests}
            onChange={(v) => saveEnq.mutate(v)}
          />
        </Panel>
        <Panel title="System">
          <ul className="space-y-1.5 text-[14px]">
            <li>
              Email: <strong>{data.emailConfigured ? 'configured' : 'not configured'}</strong>
              {!data.emailConfigured && <span className="block text-[12.5px] text-plum/70">Set SMTP_* environment variables to send notifications and password-reset emails.</span>}
            </li>
            <li>
              Media storage: <strong>{data.storage === 's3' ? 'S3 object storage' : 'local disk (development only)'}</strong>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
