export type Role = 'CUSTOMER' | 'ADMIN';
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  emailVerified: boolean;
}

export interface Media {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption?: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface WorkCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: CategoryRef;
  cover: Media | null;
  featured: boolean;
  completedAt: string | null;
  publishedAt: string | null;
}

export interface WorkDetail extends WorkCard {
  description: string;
  priceRange: string | null;
  enquiryEnabled: boolean;
  gallery: Media[];
  video: Media | null;
  beforeAfter: { before: Media; after: Media } | null;
}

export interface Service {
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
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover: Media | null;
  featured: boolean;
  workCount: number | null;
}

export interface Category extends CategoryRef {
  description: string | null;
  cover: Media | null;
  workCount: number | null;
}

export interface Business {
  name: string;
  tagline: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  mapEmbedUrl: string | null;
  mapLink: string | null;
  socials: { instagram: string | null; facebook: string | null; youtube: string | null; pinterest: string | null };
}

export interface SiteData {
  footerBlurb: string | null;
  announcement: string | null;
  business: Business;
  booking: {
    enabled: boolean;
    configured: boolean;
    timezone: string;
    slotMinutes: number;
    allowGuests: boolean;
    maxAdvanceDays: number;
  };
  enquiries: { allowGuests: boolean };
  services: { id: string; slug: string; title: string; isAvailable: boolean }[];
  categories: CategoryRef[];
  emailEnabled: boolean;
}

export interface SectionText {
  title: string;
  subtitle: string | null;
}

export interface HomeContent {
  announcement: string | null;
  hero: {
    eyebrow: string | null;
    headline: string;
    subtext: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
    imageId: string | null;
    show3d: boolean;
    features: string[];
    image?: Media | null;
  };
  sections: Record<
    'services' | 'featuredWork' | 'collections' | 'process' | 'about' | 'booking' | 'testimonials' | 'contact',
    boolean
  >;
  services: SectionText;
  featuredWork: SectionText & { limit: number };
  collections: SectionText & { collectionIds: string[] };
  process: { title: string; subtitle: string | null; steps: { title: string; body: string }[] };
  about: {
    eyebrow: string | null;
    title: string;
    body: string;
    imageId: string | null;
    image?: Media | null;
    badgeTitle: string | null;
    badgeText: string | null;
    stats: { value: string; label: string }[];
  };
  booking: SectionText & { eyebrow: string | null };
  testimonials: SectionText;
  contact: SectionText;
  footer: { blurb: string | null };
}

export interface HomeData {
  content: HomeContent;
  services: Service[];
  featuredWork: WorkCard[];
  collections: Collection[];
  testimonials: { id: string; name: string; context: string | null; text: string }[];
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type EnquiryStatus = 'NEW' | 'UNDER_REVIEW' | 'RESPONDED' | 'CLOSED';

export interface CustomerAppointment {
  id: string;
  reference: string;
  serviceTitle: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  message: string | null;
  designRef: string | null;
  statusNote: string | null;
  relatedWork: { slug: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
  pendingRequest: { id: string; requestedStartAt: string | null; message: string | null; createdAt: string } | null;
}

export interface Slot {
  start: string;
  end: string;
  label: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}
