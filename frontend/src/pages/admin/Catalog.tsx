import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import type { Media } from '../../lib/types';
import { AdminPageHeader } from '../../components/layout/AppLayouts';
import { Alert, Button, ConfirmDialog, EmptyState, Input, Modal, PageLoader, Select, StatusBadge, Textarea, Toggle, useToast } from '../../components/ui';
import { MultiImageField, SingleImageField } from '../../components/admin/MediaUploader';
import type { AdminWork } from './Work';

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['site'] });
    qc.invalidateQueries({ queryKey: ['services'] });
    qc.invalidateQueries({ queryKey: ['collections'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  };
}

function ReorderButtons({ i, n, onMove }: { i: number; n: number; onMove: (from: number, to: number) => void }) {
  return (
    <span className="flex">
      <button className="rounded p-1.5 hover:bg-blush-50 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label="Move up">
        <ArrowUp className="h-4 w-4" />
      </button>
      <button className="rounded p-1.5 hover:bg-blush-50 disabled:opacity-30" disabled={i === n - 1} onClick={() => onMove(i, i + 1)} aria-label="Move down">
        <ArrowDown className="h-4 w-4" />
      </button>
    </span>
  );
}

function useReorder<T extends { id: string }>(endpoint: string, items: T[] | undefined) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [order, setOrder] = useState<T[]>([]);
  useEffect(() => setOrder(items ?? []), [items]);
  const save = useMutation({
    mutationFn: (ids: string[]) => api.put(endpoint, { ids }),
    onSuccess: invalidate,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const move = (from: number, to: number) => {
    const n = [...order];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setOrder(n);
    save.mutate(n.map((i) => i.id));
  };
  return { order, move };
}

// ═════════════ Services ═════════════

interface AdminService {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string;
  cover: Media | null;
  images: Media[];
  priceRange: string | null;
  duration: string | null;
  isAvailable: boolean;
  availability: string | null;
  isCore: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

export function AdminServices() {
  useDocumentTitle('Services');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'services'], queryFn: () => api.get<{ services: AdminService[] }>('/admin/services') });
  const { order, move } = useReorder('/admin/services-order', data?.services);
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AdminService | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/services/${id}`),
    onSuccess: () => {
      toast('Service deleted');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <>
      <AdminPageHeader
        title="Services"
        subtitle="The four core services plus any extras. Order here is the order on the website."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add service
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <ul className="space-y-2">
          {order.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-beige bg-ivory p-3">
              <ReorderButtons i={i} n={order.length} onMove={move} />
              <div className="h-14 w-12 overflow-hidden rounded-md bg-beige/50">{s.cover && <img src={s.cover.thumbUrl ?? s.cover.url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.title} {s.isCore && <span className="ml-1 rounded-full bg-blush-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-deep">Core</span>}
                </p>
                <p className="truncate text-[12.5px] text-plum/75">
                  {[s.priceRange, s.duration, s.isAvailable ? 'Taking bookings' : 'Not taking bookings'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <StatusBadge status={s.status} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.title}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setToDelete(s)} aria-label={`Delete ${s.title}`}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ServiceEditor service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete service?"
        message={
          <>
            “{toDelete?.title}” will be removed from the website. Past appointments keep their service name. Consider setting it to <strong>Draft</strong> instead if you may offer it again.
          </>
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

function ServiceEditor({ service, onClose }: { service: AdminService | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [f, setF] = useState({
    title: service?.title ?? '',
    slug: service?.slug ?? '',
    summary: service?.summary ?? '',
    description: service?.description ?? '',
    cover: service?.cover ?? null,
    images: service?.images ?? [],
    priceRange: service?.priceRange ?? '',
    duration: service?.duration ?? '',
    isAvailable: service?.isAvailable ?? true,
    availability: service?.availability ?? '',
    status: service?.status ?? 'DRAFT',
  });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, coverId: f.cover?.id ?? null, imageIds: f.images.map((i) => i.id), cover: undefined, images: undefined };
      return service ? api.put(`/admin/services/${service.id}`, body) : api.post('/admin/services', body);
    },
    onSuccess: () => {
      toast('Service saved');
      invalidate();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
      if (e instanceof ApiError) setErrors(e.fields);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={service ? `Edit ${service.title}` : 'New service'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save service
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} />
          <Select label="Visibility" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'DRAFT' | 'PUBLISHED' })}>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft (hidden)</option>
          </Select>
        </div>
        <Input label="Short summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={300} />
        <Textarea label="Description" required rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Price / range (optional)" value={f.priceRange} onChange={(e) => setF({ ...f, priceRange: e.target.value })} placeholder="Leave blank to hide" />
          <Input label="Typical duration (optional)" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder="Leave blank to hide" />
          <Input label="Availability note (optional)" value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} />
          <Input label="URL slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} error={errors.slug} hint="Blank = from title" />
        </div>
        <Toggle label="Taking appointments" description="When off, the service shows but cannot be booked." checked={f.isAvailable} onChange={(v) => setF({ ...f, isAvailable: v })} />
        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          <SingleImageField label="Cover image" value={f.cover} onChange={(m) => setF({ ...f, cover: m })} />
          <MultiImageField label="Extra photos" value={f.images} onChange={(m) => setF({ ...f, images: m })} max={20} />
        </div>
      </div>
    </Modal>
  );
}

// ═════════════ Categories ═════════════

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover: Media | null;
  isActive: boolean;
  workCount: number;
}

export function AdminCategories() {
  useDocumentTitle('Categories');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ categories: AdminCategory[] }>('/admin/categories') });
  const { order, move } = useReorder('/admin/categories-order', data?.categories);
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AdminCategory | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      toast('Category deleted');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => {
      toast(errorMessage(e), 'error');
      setToDelete(null);
    },
  });
  return (
    <>
      <AdminPageHeader
        title="Categories"
        subtitle="Gallery filters on the Recent Work page."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <ul className="space-y-2">
          {order.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-beige bg-ivory p-3">
              <ReorderButtons i={i} n={order.length} onMove={move} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.name} {!c.isActive && <span className="text-[12px] font-normal text-plum/60">(hidden)</span>}
                </p>
                <p className="text-[12.5px] text-plum/75">
                  /{c.slug} · {c.workCount} design{c.workCount === 1 ? '' : 's'}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setToDelete(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <CategoryEditor category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete category?"
        message={toDelete?.workCount ? `“${toDelete.name}” has ${toDelete.workCount} design(s). Move them to another category first.` : `“${toDelete?.name}” will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

function CategoryEditor({ category, onClose }: { category: AdminCategory | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [f, setF] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    cover: category?.cover ?? null,
    isActive: category?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, slug: f.slug, description: f.description, coverId: f.cover?.id ?? null, isActive: f.isActive };
      return category ? api.put(`/admin/categories/${category.id}`, body) : api.post('/admin/categories', body);
    },
    onSuccess: () => {
      toast('Category saved');
      invalidate();
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="URL slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} hint="Blank = from name" />
        <Textarea label="Description (optional)" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Toggle label="Show as a filter on the website" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
        <SingleImageField label="Cover image (optional)" value={f.cover} onChange={(m) => setF({ ...f, cover: m })} />
      </div>
    </Modal>
  );
}

// ═════════════ Collections ═════════════

interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover: Media | null;
  featured: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  workCount: number | null;
  workIds: string[];
}

export function AdminCollections() {
  useDocumentTitle('Collections');
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'collections'], queryFn: () => api.get<{ collections: AdminCollection[] }>('/admin/collections') });
  const { order, move } = useReorder('/admin/collections-order', data?.collections);
  const [editing, setEditing] = useState<AdminCollection | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AdminCollection | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/collections/${id}`),
    onSuccess: () => {
      toast('Collection deleted');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <>
      <AdminPageHeader
        title="Collections"
        subtitle="Group designs into curated edits. Featured collections appear on the homepage."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New collection
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : order.length === 0 ? (
        <EmptyState title="No collections yet" action={<Button onClick={() => setEditing('new')}>Create a collection</Button>}>
          For example “Bridal 2026” or “Festive blouses”.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {order.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-beige bg-ivory p-3">
              <ReorderButtons i={i} n={order.length} onMove={move} />
              <div className="h-14 w-12 overflow-hidden rounded-md bg-beige/50">{c.cover && <img src={c.cover.thumbUrl ?? c.cover.url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.title} {c.featured && <span className="ml-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold-dark">Featured</span>}
                </p>
                <p className="text-[12.5px] text-plum/75">{c.workCount} designs</p>
              </div>
              <StatusBadge status={c.status} />
              {c.status === 'PUBLISHED' && (
                <a href={`/collections/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-blush-50" aria-label="View on site">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.title}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setToDelete(c)} aria-label={`Delete ${c.title}`}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <CollectionEditor collection={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete collection?"
        message={`“${toDelete?.title}” will be removed. The designs in it are not deleted.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

function CollectionEditor({ collection, onClose }: { collection: AdminCollection | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const works = useQuery({ queryKey: ['admin', 'work', 'picker'], queryFn: () => api.get<{ items: AdminWork[] }>('/admin/work?limit=100') });
  const [search, setSearch] = useState('');
  const [f, setF] = useState({
    title: collection?.title ?? '',
    slug: collection?.slug ?? '',
    description: collection?.description ?? '',
    cover: collection?.cover ?? null,
    featured: collection?.featured ?? false,
    status: collection?.status ?? 'DRAFT',
    workIds: collection?.workIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, coverId: f.cover?.id ?? null, cover: undefined };
      return collection ? api.put(`/admin/collections/${collection.id}`, body) : api.post('/admin/collections', body);
    },
    onSuccess: () => {
      toast('Collection saved');
      invalidate();
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const list = (works.data?.items ?? []).filter((w) => !search || w.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <Modal
      open
      onClose={onClose}
      title={collection ? `Edit ${collection.title}` : 'New collection'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save collection
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Select label="Visibility" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'DRAFT' | 'PUBLISHED' })}>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft (hidden)</option>
          </Select>
        </div>
        <Textarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input label="URL slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} hint="Blank = from title" />
        <Toggle label="Featured on homepage" checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} />
        <SingleImageField label="Cover image" value={f.cover} onChange={(m) => setF({ ...f, cover: m })} ratio="3/4" />
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">Designs in this collection ({f.workIds.length})</legend>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" />
            <input aria-label="Filter designs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter…" className="w-full rounded-md border border-beige bg-ivory py-2 pl-9 pr-3 text-[14px]" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-beige p-2">
            {list.map((w) => (
              <label key={w.id} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-cream">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#B76E82]"
                  checked={f.workIds.includes(w.id)}
                  onChange={(e) => setF({ ...f, workIds: e.target.checked ? [...f.workIds, w.id] : f.workIds.filter((x) => x !== w.id) })}
                />
                <span className="h-9 w-8 overflow-hidden rounded bg-beige/50">{w.cover && <img src={w.cover.thumbUrl ?? w.cover.url} alt="" className="h-full w-full object-cover" />}</span>
                <span className="flex-1 truncate text-[14px]">{w.title}</span>
                {w.status === 'DRAFT' && <span className="text-[11px] text-plum/60">draft</span>}
              </label>
            ))}
            {!list.length && <p className="p-2 text-[13px] text-plum/70">No designs found.</p>}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
