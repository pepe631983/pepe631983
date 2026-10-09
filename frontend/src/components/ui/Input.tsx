import { cn } from '@/lib/cn';
import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, className, id, ...props }: Props) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20',
          error && 'border-red-500',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
