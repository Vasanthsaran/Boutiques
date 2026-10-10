import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { fmtDate } from '../../lib/format';
import type { Media, WorkDetail } from '../../lib/types';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, ConfirmDialog, EmptyState, Input, LinkButton, Modal, PageLoader, Select, StatusBadge, Textarea, Toggle, useToast } from '../../components/ui';
import { MultiImageField, SingleImageField, VideoField } from '../../components/admin/MediaUploader';
import { WorkDetailView } from '../public/Work';

export interface AdminWork {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  cover: Media | null;
  completedAt: string | null;
  featured: boolean;
  featuredOrder: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  priceRange: string | null;
  enquiryEnabled: boolean;
  updatedAt: string;
  media: { id: string; role: 'GALLERY' | 'BEFORE' | 'AFTER' | 'VIDEO'; caption: string | null; asset: Media }[];
  collectionIds: string[];
  favoriteCount?: number;
  enquiryCount?: number;
}

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
}

export function useAdminCategories() {
  return useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ categories: (AdminCategory & { isActive: boolean; workCount: number })[] }>('/admin/categories') });
}

function useWorkActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['work'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  };
  const status = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'DRAFT' | 'PUBLISHED' }) => api.post(`/admin/work/${id}/status`, { status }),
    onSuccess: (_d, v) => {
      toast(v.status === 'PUBLISHED' ? 'Published — now visible on the website' : 'Unpublished — hidden from the website');
      invalidate();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const featured = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) => api.post(`/admin/work/${id}/featured`, { featured }),
    onSuccess: (_d, v) => {
      toast(v.featured ? 'Added to featured' : 'Removed from featured');
      invalidate();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/work/${id}`),
    onSuccess: () => {
      toast('Design deleted');
      invalidate();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return { status, featured, remove };
}

// ═════════════ List ═════════════

export function AdminWorkList() {
  useDocumentTitle('Recent Work');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const category = params.get('category') ?? '';
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const cats = useAdminCategories();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'work', status, category, dq, page],
    queryFn: () =>
      api.get<{ items: AdminWork[]; total: number }>(`/admin/work?status=${status}&page=${page}&limit=25${category ? `&category=${category}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`),
  });
  const actions = useWorkActions();
  const [toDelete, setToDelete] = useState<AdminWork | null>(null);
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v && v !== 'all') p.set(k, v);
    else p.delete(k);
    setParams(p);
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Recent Work"
        subtitle="Add, edit, publish and unpublish designs. Changes appear on the website immediately."
        actions={
          <LinkButton to="/admin/recent-work/new">
            <Plus className="h-4 w-4" /> Add new work
          </LinkButton>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" />
          <label htmlFor="work-q" className="sr-only">Search</label>
          <input id="work-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, slug, description…" className="w-full rounded-md border border-beige bg-ivory py-2.5 pl-9 pr-3 text-[14px] focus:border-gold focus:outline-none" />
        </div>
        <Select aria-label="Status" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="all">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Drafts</option>
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">All categories</option>
          {cats.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading || !data ? (
        <PageLoader />
      ) : data.items.length === 0 ? (
        <EmptyState title={dq || status !== 'all' || category ? 'No designs match' : 'No designs yet'} action={<LinkButton to="/admin/recent-work/new">Add your first design</LinkButton>}>
          Uploaded work appears on the public gallery once published.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((w) => (
              <li key={w.id} className="flex flex-col gap-3 rounded-xl border border-beige bg-ivory p-3 sm:flex-row sm:items-center">
                <Link to={`/admin/recent-work/${w.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-beige/50">
                    {w.cover && <img src={w.cover.thumbUrl ?? w.cover.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold">
                      {w.title} {w.featured && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Featured" />}
                    </p>
                    <p className="truncate text-[12.5px] text-plum/75">
                      {w.category.name} · {w.media.length + (w.cover ? 1 : 0)} files · updated {fmtDate(w.updatedAt)}
                      {w.favoriteCount ? ` · ♥ ${w.favoriteCount}` : ''}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={w.status} />
                  <Button
                    size="sm"
                    variant={w.status === 'PUBLISHED' ? 'ghost' : 'soft'}
                    onClick={() => actions.status.mutate({ id: w.id, status: w.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}
                    title={w.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  >
                    {w.status === 'PUBLISHED' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {w.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => actions.featured.mutate({ id: w.id, featured: !w.featured })} aria-label={w.featured ? 'Unfeature' : 'Feature'}>
                    <Star className={clsx('h-4 w-4', w.featured && 'fill-gold text-gold')} />
                  </Button>
                  <LinkButton to={`/admin/recent-work/${w.id}`} size="sm" variant="ghost" aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </LinkButton>
                  {w.status === 'PUBLISHED' && (
                    <a href={`/recent-work/${w.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-blush-50" aria-label="View on site">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(w)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {data.total > 25 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-[13px]">
                {page} / {Math.ceil(data.total / 25)}
              </span>
              <Button size="sm" variant="outline" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this design?"
        message={
          <>
            “{toDelete?.title}” and all its photos and video will be permanently deleted. Customers who saved it will see it as unavailable. This cannot be undone —{' '}
            <strong>unpublish</strong> instead if you only want to hide it.
          </>
        }
        confirmLabel="Delete permanently"
        loading={actions.remove.isPending}
        onConfirm={() => toDelete && actions.remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

// ═════════════ Editor ═════════════

interface FormState {
  title: string;
  slug: string;
  description: string;
  categoryId: string;
  cover: Media | null;
  gallery: Media[];
  video: Media | null;
  before: Media | null;
  after: Media | null;
  completedAt: string;
  featured: boolean;
  priceRange: string;
  enquiryEnabled: boolean;
  collectionIds: string[];
  status: 'DRAFT' | 'PUBLISHED';
}

const emptyForm: FormState = {
  title: '',
  slug: '',
  description: '',
  categoryId: '',
  cover: null,
  gallery: [],
  video: null,
  before: null,
  after: null,
  completedAt: '',
  featured: false,
  priceRange: '',
  enquiryEnabled: true,
  collectionIds: [],
  status: 'DRAFT',
};

function fromWork(w: AdminWork): FormState {
  const byRole = (r: string) => w.media.filter((m) => m.role === r).map((m) => m.asset);
  return {
    title: w.title,
    slug: w.slug,
    description: w.description,
    categoryId: w.categoryId,
    cover: w.cover,
    gallery: byRole('GALLERY'),
    video: byRole('VIDEO')[0] ?? null,
    before: byRole('BEFORE')[0] ?? null,
    after: byRole('AFTER')[0] ?? null,
    completedAt: w.completedAt ?? '',
    featured: w.featured,
    priceRange: w.priceRange ?? '',
    enquiryEnabled: w.enquiryEnabled,
    collectionIds: w.collectionIds,
    status: w.status,
  };
}

export function AdminWorkEditor() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add new work' : 'Edit work');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useAdminCategories();
  const collections = useQuery({ queryKey: ['admin', 'collections'], queryFn: () => api.get<{ collections: { id: string; title: string }[] }>('/admin/collections') });
  const existing = useQuery({ queryKey: ['admin', 'work', 'one', id], queryFn: () => api.get<{ work: AdminWork }>(`/admin/work/${id}`), enabled: !isNew });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'DRAFT' | 'PUBLISHED'>(null);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existing.data) setForm(fromWork(existing.data.work));
  }, [existing.data]);
  useEffect(() => {
    if (isNew && !form.categoryId && cats.data?.categories.length) setForm((f) => ({ ...f, categoryId: cats.data!.categories[0].id }));
  }, [cats.data, isNew, form.categoryId]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const previewWork: WorkDetail = useMemo(() => {
    const cat = cats.data?.categories.find((c) => c.id === form.categoryId);
    return {
      id: id ?? 'preview',
      slug: form.slug || 'preview',
      title: form.title || 'Untitled design',
      excerpt: form.description.slice(0, 180),
      description: form.description,
      category: { id: cat?.id ?? '', name: cat?.name ?? 'Category', slug: cat?.slug ?? '' },
      cover: form.cover,
      featured: form.featured,
      completedAt: form.completedAt || null,
      publishedAt: null,
      priceRange: form.priceRange || null,
      enquiryEnabled: form.enquiryEnabled,
      gallery: form.gallery,
      video: form.video,
      beforeAfter: form.before && form.after ? { before: form.before, after: form.after } : null,
    };
  }, [form, cats.data, id]);

  async function save(status: 'DRAFT' | 'PUBLISHED') {
    setError(null);
    setErrors({});
    if (status === 'PUBLISHED' && !form.cover) {
      setError('Add a cover photo before publishing (or save as a draft).');
      return;
    }
    setSaving(status);
    const payload = {
      title: form.title,
      slug: form.slug,
      description: form.description,
      categoryId: form.categoryId,
      coverId: form.cover?.id ?? null,
      media: [
        ...form.gallery.map((m) => ({ assetId: m.id, role: 'GALLERY' })),
        ...(form.video ? [{ assetId: form.video.id, role: 'VIDEO' }] : []),
        ...(form.before ? [{ assetId: form.before.id, role: 'BEFORE' }] : []),
        ...(form.after ? [{ assetId: form.after.id, role: 'AFTER' }] : []),
      ],
      completedAt: form.completedAt || null,
      featured: form.featured,
      priceRange: form.priceRange,
      enquiryEnabled: form.enquiryEnabled,
      status,
      collectionIds: form.collectionIds,
    };
    try {
      const res = isNew ? await api.post<{ work: AdminWork }>('/admin/work', payload) : await api.put<{ work: AdminWork }>(`/admin/work/${id}`, payload);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['work'] });
      qc.invalidateQueries({ queryKey: ['work-detail'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      toast(status === 'PUBLISHED' ? 'Published — live on the website' : 'Draft saved (not visible to the public)');
      if (isNew) navigate(`/admin/recent-work/${res.work.id}`, { replace: true });
      else setForm(fromWork(res.work));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fields);
      } else setError('Could not save. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(null);
    }
  }

  if (!isNew && existing.isLoading) return <PageLoader />;
  if (!isNew && existing.error) return <Alert tone="error">{errorMessage(existing.error)}</Alert>;

  return (
    <>
      <AdminPageHeader
        title={isNew ? 'Add new work' : 'Edit work'}
        subtitle={
          !isNew && existing.data ? (
            <span className="inline-flex items-center gap-2">
              <StatusBadge status={existing.data.work.status} />
              {existing.data.work.status === 'PUBLISHED' && (
                <a href={`/recent-work/${existing.data.work.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-deep underline">
                  View on site <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </span>
          ) : (
            'Fill in the details, upload photos, preview, then save as draft or publish.'
          )
        }
        actions={
          <Link to="/admin/recent-work" className="text-[13px] text-plum underline">
            ← Back to list
          </Link>
        }
      />
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border border-beige bg-ivory p-5">
            <h2 className="text-[19px]">1 · Details</h2>
            <Input label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} maxLength={140} />
            <Textarea label="Description" required rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} error={errors.description} maxLength={5000} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Category" required value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={errors.categoryId}>
                {cats.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input label="Date completed" type="date" value={form.completedAt} onChange={(e) => set('completedAt', e.target.value)} />
              <Input label="Price range (optional)" value={form.priceRange} onChange={(e) => set('priceRange', e.target.value)} placeholder="Only if you want it shown" maxLength={80} />
              <Input label="URL slug" value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} error={errors.slug} hint="Leave blank to generate from the title" />
            </div>
          </section>
          <section className="space-y-6 rounded-xl border border-beige bg-ivory p-5">
            <h2 className="text-[19px]">2 · Photos &amp; video</h2>
            <SingleImageField label="Cover photo" value={form.cover} onChange={(m) => set('cover', m)} hint="Shown in the gallery grid. Required to publish." ratio="3/4" />
            <MultiImageField label="More photos" value={form.gallery} onChange={(m) => set('gallery', m)} hint="JPG, PNG, WebP or HEIC up to 15 MB each. Use the arrows to reorder." />
            <VideoField value={form.video} onChange={(m) => set('video', m)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SingleImageField label="Before (optional)" value={form.before} onChange={(m) => set('before', m)} />
              <SingleImageField label="After (optional)" value={form.after} onChange={(m) => set('after', m)} />
            </div>
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="space-y-3 rounded-xl border border-beige bg-ivory p-5">
            <h2 className="text-[19px]">3 · Options</h2>
            <Toggle label="Featured on homepage" checked={form.featured} onChange={(v) => set('featured', v)} />
            <Toggle label="Accept enquiries" description="Shows “Request a similar design”" checked={form.enquiryEnabled} onChange={(v) => set('enquiryEnabled', v)} />
            {collections.data && collections.data.collections.length > 0 && (
              <fieldset className="pt-2">
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">Collections</legend>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {collections.data.collections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#B76E82]"
                        checked={form.collectionIds.includes(c.id)}
                        onChange={(e) => set('collectionIds', e.target.checked ? [...form.collectionIds, c.id] : form.collectionIds.filter((x) => x !== c.id))}
                      />
                      {c.title}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </section>
          <section className="space-y-2.5 rounded-xl border border-beige bg-ivory p-5">
            <h2 className="text-[19px]">4 · Preview &amp; save</h2>
            <Button variant="outline" className="w-full" onClick={() => setPreview(true)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button variant="ghost" className="w-full ring-1 ring-beige" loading={saving === 'DRAFT'} disabled={Boolean(saving)} onClick={() => save('DRAFT')}>
              {form.status === 'PUBLISHED' && !isNew ? 'Unpublish & save as draft' : 'Save draft'}
            </Button>
            <Button className="w-full" loading={saving === 'PUBLISHED'} disabled={Boolean(saving)} onClick={() => save('PUBLISHED')}>
              {form.status === 'PUBLISHED' && !isNew ? 'Save & keep published' : 'Publish'}
            </Button>
            {dirty && <p className="text-center text-[12px] text-warning">Unsaved changes</p>}
          </section>
        </aside>
      </div>
      <Modal open={preview} onClose={() => setPreview(false)} title="Preview — as visitors will see it" size="xl">
        <div className="-mx-5 -my-5 bg-cream">
          <WorkDetailView work={previewWork} related={[]} preview />
        </div>
      </Modal>
    </>
  );
}

// ═════════════ Gallery & featured ordering ═════════════

export function AdminGallery() {
  useDocumentTitle('Gallery & featured');
  const qc = useQueryClient();
  const toast = useToast();
  const actions = useWorkActions();
  const featured = useQuery({ queryKey: ['admin', 'work', 'featured'], queryFn: () => api.get<{ items: AdminWork[] }>('/admin/work/featured') });
  const all = useQuery({ queryKey: ['admin', 'work', 'all-grid'], queryFn: () => api.get<{ items: AdminWork[] }>('/admin/work?limit=100') });
  const [order, setOrder] = useState<AdminWork[]>([]);
  useEffect(() => {
    if (featured.data) setOrder(featured.data.items);
  }, [featured.data]);
  const saveOrder = useMutation({
    mutationFn: () => api.put('/admin/work/featured-order', { ids: order.map((w) => w.id) }),
    onSuccess: () => {
      toast('Featured order saved');
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const move = (i: number, d: number) => {
    const n = [...order];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setOrder(n);
  };
  const changed = featured.data && order.map((o) => o.id).join() !== featured.data.items.map((o) => o.id).join();
  return (
    <>
      <AdminPageHeader title="Gallery & featured" subtitle="Choose which designs feature on the homepage and in what order." />
      <section className="mb-8 rounded-xl border border-beige bg-ivory p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[20px]">Featured order</h2>
          <Button size="sm" disabled={!changed} loading={saveOrder.isPending} onClick={() => saveOrder.mutate()}>
            Save order
          </Button>
        </div>
        {order.length ? (
          <ol className="space-y-2">
            {order.map((w, i) => (
              <li key={w.id} className="flex items-center gap-3 rounded-lg bg-cream p-2">
                <span className="w-6 text-center font-serif text-gold-dark">{i + 1}</span>
                <div className="h-12 w-10 overflow-hidden rounded bg-beige/50">{w.cover && <img src={w.cover.thumbUrl ?? w.cover.url} alt="" className="h-full w-full object-cover" />}</div>
                <span className="flex-1 truncate text-[14px] font-medium">
                  {w.title} {w.status === 'DRAFT' && <span className="text-[12px] text-plum/60">(draft — hidden)</span>}
                </span>
                <button className="rounded p-1.5 hover:bg-blush-50 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button className="rounded p-1.5 hover:bg-blush-50 disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[14px] text-plum/80">No featured designs. Tap the star on any design below. If none are featured, the homepage shows the latest published work.</p>
        )}
      </section>
      <h2 className="mb-3 text-[20px]">All designs</h2>
      {all.isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {all.data?.items.map((w) => (
            <div key={w.id} className="overflow-hidden rounded-xl border border-beige bg-ivory">
              <Link to={`/admin/recent-work/${w.id}`} className="block aspect-[3/4] bg-beige/40">
                {w.cover && <img src={w.cover.thumbUrl ?? w.cover.url} alt={w.title} className="h-full w-full object-cover" loading="lazy" />}
              </Link>
              <div className="p-2.5">
                <p className="truncate text-[13px] font-semibold">{w.title}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <StatusBadge status={w.status} />
                  <div className="flex">
                    <button
                      className="rounded p-1.5 hover:bg-blush-50"
                      onClick={() => actions.status.mutate({ id: w.id, status: w.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}
                      aria-label={w.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                      title={w.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                    >
                      {w.status === 'PUBLISHED' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button className="rounded p-1.5 hover:bg-blush-50" onClick={() => actions.featured.mutate({ id: w.id, featured: !w.featured })} aria-label={w.featured ? 'Unfeature' : 'Feature'}>
                      <Star className={clsx('h-4 w-4', w.featured && 'fill-gold text-gold')} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
