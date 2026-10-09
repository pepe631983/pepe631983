import type { ReactNode } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <div className="relative flex flex-col justify-between bg-brand-navy px-6 py-8 text-white md:w-[42%] md:min-h-full">
        <LanguageSwitcher variant="dark" />
        <div className="my-8 md:my-0">
          <BrandMark size="lg" theme="onDark" showTagline />
        </div>
        <p className="hidden text-sm text-white/60 md:block">
          Turks and Caicos Islands · USD · {import.meta.env.MODE === 'development' ? 'Development' : 'Secure'}
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-surface p-4">{children}</div>
    </div>
  );
}
