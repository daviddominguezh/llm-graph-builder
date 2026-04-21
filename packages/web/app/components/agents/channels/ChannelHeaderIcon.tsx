'use client';

import { Compass, Globe } from 'lucide-react';
import Image from 'next/image';
import React from 'react';

interface ChannelHeaderIconProps {
  channelKey: string;
  label: string;
  enabled?: boolean;
}

const ICON_SIZE = 14;

const ICON_FILE: Record<string, string> = {
  whatsapp: '/channels/whatsapp.svg',
  slack: '/channels/slack.svg',
  teams: '/channels/teams.svg',
  google_chat: '/channels/googlechat.svg',
  telegram: '/channels/telegram.svg',
  instagram: '/channels/instagram.svg',
  discord: '/channels/discord.svg',
};

const LUCIDE_ICONS: Record<string, React.ReactNode> = {
  web: <Compass className="size-3.5 text-primary" />,
  api: <Globe className="size-3.5 text-primary" />,
};

function ChannelIconElement({ channelKey, label }: { channelKey: string; label: string }) {
  const lucideIcon = LUCIDE_ICONS[channelKey];
  if (lucideIcon) return <>{lucideIcon}</>;

  const src = ICON_FILE[channelKey];
  if (src !== undefined) {
    return <Image src={src} alt={label} width={ICON_SIZE} height={ICON_SIZE} />;
  }

  return null;
}

export function ChannelHeaderIcon({ channelKey, label, enabled = true }: ChannelHeaderIconProps) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${enabled ? '' : 'opacity-40'}`}>
      <ChannelIconElement channelKey={channelKey} label={label} />
      <span>{label}</span>
    </div>
  );
}
