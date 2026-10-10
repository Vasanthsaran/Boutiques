/**
 * Safe, idempotent seed. Creates only structural content the spec defines:
 *  - the four core services (no prices, durations or policies — the owner adds those)
 *  - the default Recent Work categories
 *  - default settings (homepage copy from the brief, booking defaults, guest options off)
 * It never overwrites rows the owner has already edited, and it does NOT create
 * fake work, testimonials, working hours, addresses or phone numbers.
 */
import { prisma } from '../src/db.js';
import { DEFAULT_BOOKING, DEFAULT_BUSINESS, DEFAULT_ENQUIRY, DEFAULT_HOME } from '../src/lib/settings.js';

const services = [
  {
    slug: 'custom-designing',
    title: 'Custom Designing',
    summary: 'Outfits designed from your idea, occasion and measurements.',
    description:
      'Bring an idea, a sketch or a reference photo and we will design an outfit around it — from silhouette and fabric to neckline, sleeves and finishing details.',
  },
  {
    slug: 'maggam-work',
    title: 'Maggam Work',
    summary: 'Intricate hand-embellished Maggam (aari) work.',
    description:
      'Maggam work adds rich, hand-crafted embellishment to blouses and outfits. Share the look you love and we will plan the motif and placement with you.',
  },
  {
    slug: 'embroidery',
    title: 'Embroidery',
    summary: 'Hand and machine embroidery tailored to your outfit.',
    description:
      'From delicate borders to statement motifs, embroidery is designed to complement your fabric and occasion.',
  },
  {
    slug: 'stitching',
    title: 'Stitching',
    summary: 'Expert stitching for blouses, sarees and outfits.',
    description:
      'Well-fitted stitching for blouses, saree blouses and outfits, made to your measurements.',
  },
];

const categories = [
  'Custom Designs',
  'Maggam Work',
  'Embroidery',
  'Blouse Designs',
  'Bridal',
  'Saree Blouse Stitching',
  'Designer Outfits',
  'Festive Wear',
  'Other',
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  for (const [i, s] of services.entries()) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      create: { ...s, isCore: true, status: 'PUBLISHED', sortOrder: i },
      update: {},
    });
  }
  for (const [i, name] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug: slugify(name) },
      create: { name, slug: slugify(name), sortOrder: i },
      update: {},
    });
  }
  const settings: [string, unknown][] = [
    ['business', DEFAULT_BUSINESS],
    ['homepage', { draft: DEFAULT_HOME, published: DEFAULT_HOME, publishedAt: null, draftUpdatedAt: null }],
    ['booking', DEFAULT_BOOKING],
    ['enquiries', DEFAULT_ENQUIRY],
  ];
  for (const [key, value] of settings) {
    await prisma.storeSettings.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }
  console.info('Seed complete: 4 core services, default categories and settings (existing rows untouched).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
