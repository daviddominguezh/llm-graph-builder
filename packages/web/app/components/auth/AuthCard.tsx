import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Card className="w-full max-w-sm bg-background">
        <CardHeader className='bg-background'>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 bg-background">{children}</CardContent>
      </Card>
    </div>
  );
}
