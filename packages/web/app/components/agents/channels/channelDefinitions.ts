export interface ChannelDef {
  key: string;
  labelKey: string;
}

/** API is handled separately as the first column with a toggle. */
export const CHANNELS: ChannelDef[] = [
  { key: 'whatsapp', labelKey: 'whatsapp' },
  { key: 'slack', labelKey: 'slack' },
  { key: 'teams', labelKey: 'teams' },
  { key: 'google_chat', labelKey: 'googleChat' },
  { key: 'telegram', labelKey: 'telegram' },
  { key: 'instagram', labelKey: 'instagram' },
  { key: 'discord', labelKey: 'discord' },
];
