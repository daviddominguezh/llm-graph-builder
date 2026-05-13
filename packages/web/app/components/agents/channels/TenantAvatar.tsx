'use client';

import { toProxyImageSrc } from '@/app/lib/supabase/image';
import Image from 'next/image';

interface TenantAvatarProps {
  name: string;
  avatarUrl: string | null;
  small?: boolean;
}

export function TenantAvatar({ name, avatarUrl, small = false }: TenantAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={small ? 20 : 24}
        height={small ? 20 : 24}
        className={`${small ? 'size-5' : 'size-6'} shrink-0 rounded-full object-cover border border-input border-[1px]`}
      />
    );
  }

  return (
    <div
      className={`bg-muted text-muted-foreground flex ${small ? 'size-5' : 'size-6'} shrink-0 items-center justify-center rounded-full text-[10px] font-medium border`}
    >
      {initial}
    </div>
  );
}
