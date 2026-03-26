'use client';

import { Bot, Radio, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { ApiKeyRow } from '@/app/lib/apiKeys';
import { Separator } from '@/components/ui/separator';

import { EditorClient } from './EditorClient';

type TabId = 'agent' | 'channels' | 'settings';

interface EditorTabsProps {
  agentSlug: string;
  agentId: string;
  agentName: string;
  orgSlug: string;
  orgId: string;
  orgName: string;
  orgAvatarUrl: string | null;
  initialVersion: number;
  orgApiKeys: ApiKeyRow[];
  stagingApiKeyId: string | null;
  productionApiKeyId: string | null;
}

const TAB_ICONS: Record<TabId, LucideIcon> = {
  agent: Bot,
  channels: Radio,
  settings: Settings,
};

const TABS: TabId[] = ['agent', 'channels', 'settings'];

interface TabButtonProps {
  tab: TabId;
  active: boolean;
  onClick: (tab: TabId) => void;
  label: string;
}

function TabButton({ tab, active, onClick, label }: TabButtonProps) {
  const Icon = TAB_ICONS[tab];
  return (
    <button
      onClick={() => onClick(tab)}
      className={`w-[100px] h-full text-xs font-medium transition-colors relative flex items-center justify-center gap-1.5 cursor-pointer ${
        active
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground border-b-2 border-background'
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

export function EditorTabs(props: EditorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const t = useTranslations('editor.tabs');

  return (
    <div className="w-full h-full flex flex-col">
      <div className="w-full h-[41px] bg-background shrink-0 border-b flex items-center px-4">
        <div className="text-sm font-semibold mr-4">{props.agentSlug}</div>
        <Separator orientation="vertical" />
        <div className="flex h-full">
          {TABS.map((tab) => (
            <TabButton
              key={tab}
              tab={tab}
              active={activeTab === tab}
              onClick={setActiveTab}
              label={t(tab)}
            />
          ))}
        </div>
      </div>
      {activeTab === 'agent' && <AgentTab {...props} />}
      {activeTab === 'channels' && <Placeholder label={t('channelsPlaceholder')} />}
      {activeTab === 'settings' && <Placeholder label={t('settingsPlaceholder')} />}
    </div>
  );
}

function AgentTab(props: EditorTabsProps) {
  return (
    <EditorClient
      agentId={props.agentId}
      agentSlug={props.agentSlug}
      agentName={props.agentName}
      orgSlug={props.orgSlug}
      orgId={props.orgId}
      orgName={props.orgName}
      orgAvatarUrl={props.orgAvatarUrl}
      initialVersion={props.initialVersion}
      orgApiKeys={props.orgApiKeys}
      stagingApiKeyId={props.stagingApiKeyId}
      productionApiKeyId={props.productionApiKeyId}
    />
  );
}
