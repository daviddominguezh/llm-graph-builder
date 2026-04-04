import { Compass, Globe, Instagram } from 'lucide-react';
import Image from 'next/image';
import React from 'react';

import { WhatsAppIcon } from './WhatsAppIcon';

interface ChannelBadgeProps {
  channel: string;
  size?: number;
  className?: string;
}

const SVG_CHANNELS: Record<string, string> = {
  slack: '/channels/slack.svg',
  teams: '/channels/teams.svg',
  google_chat: '/channels/googlechat.svg',
  telegram: '/channels/telegram.svg',
  discord: '/channels/discord.svg',
};

function ChannelIcon({ channel, iconSize }: { channel: string; iconSize: number }) {
  if (channel === 'whatsapp') {
    return <WhatsAppIcon size={iconSize} className="text-[#25D366]" />;
  }
  if (channel === 'instagram') {
    return <Instagram size={iconSize} className="text-[#E4405F]" />;
  }
  if (channel === 'api') {
    return <Globe size={iconSize} className="text-primary" />;
  }
  if (channel === 'web') {
    return <Compass size={iconSize} className="text-primary" />;
  }
  const svgSrc = SVG_CHANNELS[channel];
  if (svgSrc !== undefined) {
    return <Image src={svgSrc} alt={channel} width={iconSize} height={iconSize} />;
  }
  return null;
}

export function ChannelBadge({ channel, size = 18, className }: ChannelBadgeProps) {
  const iconSize = Math.round(size * 0.8);

  return (
    <div
      className={`bg-white rounded-full flex items-center justify-center border border-border shadow-sm ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <ChannelIcon channel={channel} iconSize={iconSize} />
    </div>
  );
}
