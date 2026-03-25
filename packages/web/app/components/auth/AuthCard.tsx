'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';

import { ShaderBackground } from './ShaderBackground';

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen min-w-screen justify-center items-center bg-[#f7fafc]">
      <div
        className="fixed left-1/2 top-0 overflow-hidden pointer-events-none"
        style={{
          width: '3000px',
          height: '2500px',
          transform: 'translateX(calc(-50% + 250px)) translateY(-25%)',
          maskImage: 'linear-gradient(black 0%, black 75%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(black 0%, black 75%, transparent 100%)',
          zIndex: 0,
        }}
      >
        <ShaderBackground />
      </div>

      <div className="absolute w-full h-full flex flex-col">
        <div className="border-b border-card w-full h-19 shrink-0 flex items-end pl-26">
          <div className='font-bold text-xl px-4 py-2'>OpenFlow</div>
        </div>
        <div className="w-full flex-1 min-h-[0px] flex">
          <div className="border-r border-card w-26 h-full shrink-0"></div>
          <div className="flex-1 min-w-[0px] h-full shrink-0"></div>
          <div className="border-l border-card w-26 h-full shrink-0"></div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <Card className="border-none ring-0 outline-0 auth-card-enter w-full max-w-sm shadow-2xl bg-popover px-3 py-5 text-foreground/80">
          <CardHeader>
            <CardTitle className="text-xl font-bold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
