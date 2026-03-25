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
    <>
      <ShaderBackground />
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <Card className="auth-card-enter w-full max-w-sm backdrop-blur-xl bg-card/80 dark:bg-card/60 ring-1 ring-foreground/5 dark:ring-white/10 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
    </>
  );
}
