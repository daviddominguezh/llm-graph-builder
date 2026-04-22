'use client';

import logo from '@/app/assets/brand-icon.png';
import logoBlack from '@/app/openflowLogoBlack.png';
import logoWhite from '@/app/openflowLogoWhite.png';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { GlassPanel } from '@/components/ui/glass-panel';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { ShaderBackground } from './ShaderBackground';

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}

export function AuthCard({ title, description, children, className = '' }: AuthCardProps) {
  return (
    <div className="flex min-h-screen min-w-screen justify-center items-center">
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <ShaderBackground />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 p-4 z-3">
        <div className="flex gap-2 items-center">
          <Image className="mb-1" src={logo} alt="OpenFlow" height={30} priority />
          <Image className="dark:hidden" src={logoBlack} alt="OpenFlow" height={24} priority />
          <Image className="hidden dark:block" src={logoWhite} alt="OpenFlow" height={24} priority />
        </div>
        <GlassPanel
          variant="foreground"
          className={`rounded-xl w-full max-w-sm auth-card-enter px-2 ${className}`}
        >
          <div className="flex flex-col px-3 py-5 text-foreground/80 bg-transparent gap-5 h-full">
            <div className="shrink-0">
              <CardTitle className="text-xl font-bold">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex flex-col gap-4 overflow-hidden">{children}</div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
