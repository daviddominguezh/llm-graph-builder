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
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <Card className="auth-card-enter w-full max-w-sm ring-1 ring-foreground/5 dark:ring-white/10 shadow-2xl bg-popover">
          <CardHeader>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
      <div className="hidden lg:flex lg:flex-1 items-center justify-center bg-muted/30 dark:bg-muted/10 overflow-hidden">
        <ShaderBackground />
      </div>
    </div>
  );
}
