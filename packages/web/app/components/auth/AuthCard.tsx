'use client';

import logo from '@/app/assets/brand-icon.png';
import logoBlack from '@/app/openflowLogoBlack.png';
import logoWhite from '@/app/openflowLogoWhite.png';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
          <Image className="mb-1" src={logo} alt="OpenFlow" height={60} priority />
        </div>
        <div
          className={cn(
            'auth-card-enter relative w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-sm',
            className
          )}
        >
          <div className="flex flex-col gap-5 px-5 py-5 h-full">
            <div className="shrink-0">
              <CardTitle className="text-xl font-bold">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex flex-col gap-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
