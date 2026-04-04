'use client';

import Image from 'next/image';

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

export function ChannelHeaderIcon({ channelKey, label, enabled = true }: ChannelHeaderIconProps) {
  const src = ICON_FILE[channelKey];

  return (
    <div className={`flex items-center justify-center gap-1.5 ${enabled ? '' : 'opacity-40'}`}>
      {src !== undefined && (
        <Image
          src={src}
          alt={label}
          width={ICON_SIZE}
          height={ICON_SIZE}
          className={enabled ? '' : 'grayscale'}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
