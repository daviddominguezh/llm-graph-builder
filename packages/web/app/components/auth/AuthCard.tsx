'use client';

import logo from '@/app/icon.png';
import logoBlack from '@/app/openflowLogoBlack.png';
import logoWhite from '@/app/openflowLogoWhite.png';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { ShaderBackground } from './ShaderBackground';

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen min-w-screen justify-center items-center">
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <ShaderBackground />
      </div>

      <div className="absolute w-full h-full flex flex-col z-2">
        <div className="border-b border-secondary/30 w-full h-19 shrink-0 flex items-end pl-26">
          <div className="px-4 py-2 flex gap-2 items-center">
            <Image className='mb-1' src={logo} alt="OpenFlow" height={30} priority />
            <Image className="dark:hidden" src={logoBlack} alt="OpenFlow" height={24} priority />
            <Image className="hidden dark:block" src={logoWhite} alt="OpenFlow" height={24} priority />
          </div>
        </div>
        <div className="w-full flex-1 min-h-[0px] flex">
          <div className="border-r border-secondary/30 w-26 h-full shrink-0"></div>
          <div className="flex-1 min-w-[0px] h-full shrink-0"></div>
          <div className="border-l border-secondary/30 w-26 h-full shrink-0"></div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 p-4 z-3">
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
