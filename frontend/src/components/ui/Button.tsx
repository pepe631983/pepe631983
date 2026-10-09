import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({
  className,
  variant = 'primary',
  loading,
  disabled,
  children,
  ...props
}: Props) {
  const variants = {
    primary: 'bg-brand-accent hover:bg-brand-accent-hover text-white shadow-sm',
    secondary: 'bg-white border border-slate-200 hover:bg-slate-50 text-brand-navy',
    ghost: 'hover:bg-slate-100 text-slate-700',
    danger: 'bg-red-700 hover:bg-red-800 text-white',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Procesando…' : children}
    </button>
  );
}
