import type { Media } from './types';

/**
 * Default decorative photography (from the approved Stitch mock-up), used only
 * until the owner uploads their own images in the admin panel.
 */
const DECOR: Record<string, [number, number]> = {
  'hero-lehenga': [1376, 768],
  'rose-lehenga': [896, 1200],
  'ivory-saree': [896, 1200],
  'banarasi-saree': [896, 1200],
  'champagne-anarkali': [1408, 768],
  'pink-anarkali': [1408, 768],
  'blush-sharara': [768, 1376],
};

export function decor(name: keyof typeof DECOR | string, alt = ''): Media {
  const [width, height] = DECOR[name] ?? [896, 1200];
  const url = `/decor/${name}.webp`;
  return { id: `decor-${name}`, kind: 'IMAGE', url, thumbUrl: url, width, height, alt };
}

/** Default card image per core service slug. */
export const SERVICE_DECOR: Record<string, string> = {
  'custom-designing': 'champagne-anarkali',
  'maggam-work': 'rose-lehenga',
  embroidery: 'pink-anarkali',
  stitching: 'ivory-saree',
};
const ROTATION = ['ivory-saree', 'rose-lehenga', 'champagne-anarkali', 'banarasi-saree', 'blush-sharara', 'pink-anarkali'];
export const decorFor = (slug: string, i: number) => decor(SERVICE_DECOR[slug] ?? ROTATION[i % ROTATION.length]);
