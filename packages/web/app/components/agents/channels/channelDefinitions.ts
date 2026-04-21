export interface ChannelDef {
  key: string;
  labelKey: string;
  enabled: boolean;
}

/** API is handled separately as the first column with a toggle. */
export const CHANNELS: ChannelDef[] = [
  { key: 'whatsapp', labelKey: 'whatsapp', enabled: true },
  { key: 'instagram', labelKey: 'instagram', enabled: false },
  { key: 'slack', labelKey: 'slack', enabled: false },
  { key: 'teams', labelKey: 'teams', enabled: false },
  { key: 'google_chat', labelKey: 'googleChat', enabled: false },
  { key: 'telegram', labelKey: 'telegram', enabled: false },
  { key: 'discord', labelKey: 'discord', enabled: false },
];
