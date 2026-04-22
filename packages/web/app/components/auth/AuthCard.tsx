'use client';

import { CardDescription, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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

      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-4 z-3">
        <div
          className={cn(
            'auth-card-enter relative w-full max-w-sm rounded-xl bg-popover text-card-foreground shadow-sm',
            className
          )}
        >
          <div className="flex flex-col gap-5 p-5">
            <div>
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
