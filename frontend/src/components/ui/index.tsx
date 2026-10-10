import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { statusLabel } from '../../lib/format';

// ───────── Buttons ─────────

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded font-semibold uppercase tracking-[0.08em] transition-all duration-300 ease-[var(--ease-silk)] disabled:cursor-not-allowed disabled:opacity-55 select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-rose text-white shadow-md hover:bg-rose-soft',
  dark: 'bg-rose text-white shadow-md hover:bg-rose-soft',
  outline: 'bg-blush-50 text-rose hover:bg-blush-100',
  ghost: 'text-brown hover:bg-blush-50',
  danger: 'bg-danger text-white hover:bg-[#8f1e18]',
  soft: 'bg-blush-100 text-rose hover:bg-blush-200',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 text-[11px]',
  md: 'min-h-11 px-5 text-[12.5px]',
  lg: 'min-h-[50px] px-7 text-[13px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...rest} />;
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-10 w-10 items-center justify-center rounded-full text-brown transition hover:bg-blush-50 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ───────── Form fields ─────────

const inputCls =
  'w-full rounded-lg border border-transparent bg-ivory px-4 py-3 text-[14px] shadow-[0_0_0_1px_rgba(214,193,197,0.45)] text-brown placeholder:text-plum/45 transition focus:outline-none focus:ring-1 focus:ring-rose disabled:bg-cream disabled:text-plum/60 aria-[invalid=true]:border-danger';

interface FieldWrapProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}

export function FieldWrap({ label, hint, error, required, id, children, className }: FieldWrapProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brown">
          {label}
          {required && <span className="text-rose"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-plum/75">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, wrapClassName, required, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <input
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={clsx(inputCls, className)}
        {...rest}
      />
    </FieldWrap>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, wrapClassName, required, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={clsx(inputCls, 'resize-y leading-relaxed', className)}
        {...rest}
      />
    </FieldWrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, wrapClassName, required, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <select
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={error ? true : undefined}
        className={clsx(inputCls, 'appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2349363A' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <label htmlFor={id} className="cursor-pointer text-[14px] font-medium text-brown">
          {label}
        </label>
        {description && <p className="text-[12.5px] text-plum/75">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50',
          checked ? 'bg-rose' : 'bg-beige',
        )}
      >
        <span className={clsx('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

// ───────── Feedback ─────────

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={clsx('inline-flex items-center gap-2 text-plum', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-rose" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode; className?: string }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-3 rounded-md border px-4 py-3 text-[14px]',
        tone === 'error' && 'border-danger/30 bg-[#fdf0ef] text-[#8a1f19]',
        tone === 'success' && 'border-success/30 bg-[#eef7f1] text-[#2d5c43]',
        tone === 'info' && 'border-gold/40 bg-[#fbf5ea] text-brown',
        tone === 'warning' && 'border-warning/40 bg-[#fdf6e7] text-[#7a5410]',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-beige bg-ivory/70 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-gold">{icon}</div>}
      <h3 className="text-xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-[14px] text-plum/80">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden />;
}

const badgeTones: Record<string, string> = {
  PENDING: 'bg-[#fdf3dc] text-[#7a5410] border-[#ecd9a8]',
  CONFIRMED: 'bg-[#e8f4ec] text-[#2d5c43] border-[#bcdcc8]',
  COMPLETED: 'bg-[#eef0f6] text-[#3d4766] border-[#cfd5e6]',
  REJECTED: 'bg-[#fbecea] text-[#8a1f19] border-[#efc9c5]',
  CANCELLED: 'bg-[#f3eeee] text-plum border-beige',
  NEW: 'bg-blush-50 text-rose-deep border-blush',
  UNDER_REVIEW: 'bg-[#fdf3dc] text-[#7a5410] border-[#ecd9a8]',
  RESPONDED: 'bg-[#e8f4ec] text-[#2d5c43] border-[#bcdcc8]',
  CLOSED: 'bg-[#f3eeee] text-plum border-beige',
  DRAFT: 'bg-[#f3eeee] text-plum border-beige',
  PUBLISHED: 'bg-[#e8f4ec] text-[#2d5c43] border-[#bcdcc8]',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
        badgeTones[status] ?? 'border-beige bg-cream text-plum',
      )}
    >
      {statusLabel[status] ?? status}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full border border-beige bg-ivory/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-plum', className)}>
      {children}
    </span>
  );
}

// ───────── Modal / dialog ─────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-brown/30 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={clsx(
              'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-beige bg-ivory shadow-[var(--shadow-lift)] sm:rounded-xl',
              size === 'sm' && 'sm:max-w-md',
              size === 'md' && 'sm:max-w-xl',
              size === 'lg' && 'sm:max-w-3xl',
              size === 'xl' && 'sm:max-w-5xl',
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-beige px-5 py-4">
              <h2 className="text-xl">{title}</h2>
              <IconButton label="Close" onClick={onClose} data-close>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-beige px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15px] text-plum">{message}</div>
    </Modal>
  );
}

// ───────── Toasts ─────────

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}
const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={clsx(
                'pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg border px-4 py-3 text-[14px] shadow-[var(--shadow-lift)]',
                t.tone === 'success' && 'border-success/30 bg-ivory text-[#2d5c43]',
                t.tone === 'error' && 'border-danger/30 bg-ivory text-[#8a1f19]',
                t.tone === 'info' && 'border-gold/40 bg-ivory text-brown',
              )}
            >
              {t.tone === 'error' ? <AlertCircle className="h-4 w-4" /> : t.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ───────── Layout helpers ─────────

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  action,
}: {
  eyebrow?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
  action?: ReactNode;
}) {
  return (
    <div className={clsx('mb-10 flex flex-col gap-4 md:mb-12', align === 'center' ? 'items-center text-center' : 'md:flex-row md:items-end md:justify-between')}>
      <div className={clsx(align === 'center' && 'flex flex-col items-center')}>
        {eyebrow && (
          <p className="eyebrow mb-3 flex items-center gap-3">
            <span className="gold-rule" aria-hidden />
            {eyebrow}
            {align === 'center' && <span className="gold-rule" aria-hidden />}
          </p>
        )}
        <h2 className="text-[30px] text-rose-deep sm:text-[38px] lg:text-[42px]">{title}</h2>
        {subtitle && <p className={clsx('mt-3 max-w-xl text-[15.5px] text-plum/85', align === 'center' && 'mx-auto')}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <section className="bg-blush-50 pb-12 pt-40 sm:pb-16 sm:pt-48">
      <div className="container-x">
        {eyebrow && (
          <p className="eyebrow mb-4 flex items-center gap-3">
            <span className="gold-rule" aria-hidden /> {eyebrow}
          </p>
        )}
        <h1 className="max-w-3xl text-[38px] font-normal tracking-tight text-rose sm:text-[52px] lg:text-[56px]">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-[16px] text-plum">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
