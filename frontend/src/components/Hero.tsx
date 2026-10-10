import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight, BookOpen, Gem, Scissors, Sparkles } from 'lucide-react';
import { usePrefersReducedMotion } from '../lib/hooks';
import { decor } from '../lib/decor';
import type { HomeContent } from '../lib/types';

const PetalsScene = lazy(() => import('./PetalsScene'));

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** If the 3D layer throws for any reason, quietly keep the CSS petals. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CssPetals({ count = 10 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2.5 rounded-[60%_40%_60%_40%] bg-blush/90"
          style={{ left: `${(i * 37) % 100}%`, animation: `petal-fall ${12 + (i % 5) * 3}s linear ${-i * 2.1}s infinite` }}
        />
      ))}
    </div>
  );
}

const FEATURE_ICONS = [Scissors, Sparkles, Gem, Sparkles];

/** Split “Elegance, Woven Into Every Detail.” → “Elegance, Woven” / *Into Every Detail.* */
function splitHeadline(h: string) {
  const words = h.trim().split(/\s+/);
  if (words.length < 3) return [h, ''];
  const italic = Math.ceil(words.length / 2);
  return [words.slice(0, words.length - italic).join(' '), words.slice(words.length - italic).join(' ')];
}

export function Hero({ content }: { content: HomeContent['hero'] }) {
  const reduced = usePrefersReducedMotion();
  const [use3d, setUse3d] = useState(false);
  const [ready, setReady] = useState(false);
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 700], [0, reduced ? 0 : 120]);
  const bgScale = useTransform(scrollY, [0, 700], [1.05, reduced ? 1.05 : 1.12]);

  useEffect(() => {
    if (!content.show3d || reduced) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || !webglAvailable()) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const start = () => setUse3d(true);
    if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 600);
  }, [content.show3d, reduced]);

  const image = content.image ?? decor('hero-lehenga', 'Bride in a blush embroidered lehenga');
  const [line1, line2] = splitHeadline(content.headline);

  return (
    <section className="relative flex min-h-[92vh] items-center overflow-hidden bg-[#f0d3d8]">
      {/* background photo with parallax */}
      <motion.div className="absolute inset-0" style={{ y: bgY, scale: bgScale }}>
        <img src={image.url} alt={image.alt || ''} className="h-full w-full object-cover object-top brightness-[0.96] contrast-[1.02]" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-r from-cream/90 via-cream/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-cream via-transparent to-cream/50" />
      </motion.div>

      {/* petals: 3D when available, CSS otherwise */}
      {!reduced && !ready && <CssPetals count={14} />}
      {use3d && (
        <SceneBoundary onError={() => setUse3d(false)}>
          <Suspense fallback={null}>
            <motion.div className="pointer-events-none absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: 1.2 }}>
              <PetalsScene onReady={() => setReady(true)} />
            </motion.div>
          </Suspense>
        </SceneBoundary>
      )}

      <div className="container-x relative z-20 pb-20 pt-40 sm:pt-44">
        <motion.div
          className="flex max-w-2xl flex-col items-start gap-4"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          {content.eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full bg-blush-100/80 px-3 py-1 shadow-sm backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-dark" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose">{content.eyebrow}</span>
            </div>
          )}
          <h1 className="text-[40px] leading-[1.08] tracking-tight text-rose sm:text-[56px]" style={{ fontWeight: 400 }}>
            {line1}
            {line2 && (
              <>
                <br />
                <span className="font-serif italic text-brown">{line2}</span>
              </>
            )}
          </h1>
          <p className="max-w-lg text-[16px] leading-relaxed text-plum">{content.subtext}</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link to="/recent-work" className="flex items-center gap-2 rounded bg-rose px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white shadow-md transition-all hover:bg-rose-soft">
              <span>{content.primaryCtaLabel}</span>
              <ArrowUpRight className="h-[18px] w-[18px]" />
            </Link>
            <Link to="/appointments" className="flex items-center gap-2 rounded bg-blush-50 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-rose transition-all hover:bg-blush-100">
              <span>{content.secondaryCtaLabel}</span>
              <BookOpen className="h-[18px] w-[18px]" />
            </Link>
          </div>
          {content.features.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-6 text-[11px] font-semibold uppercase tracking-wider text-plum">
              {content.features.map((f, i) => {
                const Icon = FEATURE_ICONS[i] ?? Sparkles;
                return (
                  <span key={f} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-gold-dark" /> {f}
                  </span>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      <a href="#curated" className="group absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rose">Explore</span>
        <span className="flex h-8 w-5 items-start justify-center rounded-full bg-blush-100/60 p-1 shadow-sm backdrop-blur-sm">
          <span className="h-2 w-1.5 animate-bounce rounded-full bg-rose" />
        </span>
      </a>
    </section>
  );
}
