import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import type { ReactNode } from 'react';

import logo from '@/app/logoOpenflow.avif';

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Image src={logo} alt="Closer" width={56} height={56} className="rounded-md" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </div>
  );
}
