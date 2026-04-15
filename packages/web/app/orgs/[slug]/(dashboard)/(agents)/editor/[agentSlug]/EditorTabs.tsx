'use client';

import { useAgentsSidebar } from '@/app/components/agents/AgentsSidebarContext';
import { SettingsPanel } from '@/app/components/agents/SettingsPanel';
import { ChannelsPanel } from '@/app/components/agents/channels/ChannelsPanel';
import { useEditorCache } from '@/app/components/editors/EditorCacheProvider';
import type { ApiKeyRow } from '@/app/lib/apiKeys';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Separator } from '@/components/ui/separator';
import { Brain, PanelLeftClose, PanelLeftOpen, Radio, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  agentDescription: string;
  agentCategory: string;
  agentIsPublic: boolean;
}

const TAB_ICONS: Record<TabId, LucideIcon> = {
  agent: Brain,
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

const TAB_BASE =
  'cursor-pointer inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors border border-transparent';
const TAB_ACTIVE = 'bg-popover dark:bg-input text-foreground shadow-sm';
const TAB_INACTIVE =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';

function TabButton({ tab, active, onClick, label }: TabButtonProps) {
  const Icon = TAB_ICONS[tab];
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
    >
      <Icon strokeWidth={2.5} className="size-3.5" />
      {label}
    </button>
  );
}

function buildEditorElement(props: EditorTabsProps): React.ReactNode {
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

function useEditorRegistration(props: EditorTabsProps) {
  const { register, setActiveEditor } = useEditorCache();
  const propsRef = useRef(props);

  useLayoutEffect(() => {
    register(props.agentId, buildEditorElement(propsRef.current));
    setActiveEditor(props.agentId);
    return () => setActiveEditor(null);
  }, [props.agentId, register, setActiveEditor]);
}

function useSlotSync(slotRef: React.RefObject<HTMLDivElement | null>, activeTab: TabId) {
  const { setSlotRect } = useEditorCache();

  useEffect(() => {
    const el = slotRef.current;
    if (!el || activeTab !== 'agent') {
      setSlotRect(null);
      return undefined;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setSlotRect(null);
    };
  }, [activeTab, setSlotRect, slotRef]);
}

export function EditorTabs(props: EditorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('agent');
  const t = useTranslations('editor.tabs');
  const tAgents = useTranslations('agents');
  const slotRef = useRef<HTMLDivElement>(null);

  useEditorRegistration(props);
  useSlotSync(slotRef, activeTab);

  return (
    <div className="w-full h-full flex flex-col">
      <EditorTabBar activeTab={activeTab} onTabChange={setActiveTab} t={t} tAgents={tAgents} />
      <div ref={slotRef} className={activeTab === 'agent' ? 'flex-1' : 'hidden'} />
      <div className={`flex flex-col bg-background ${activeTab === 'agent' ? 'hidden' : 'flex-1'}`}>
        {activeTab === 'channels' && <ChannelsPanel orgId={props.orgId} agentId={props.agentId} />}
        {activeTab === 'settings' && (
          <SettingsPanel
            agentId={props.agentId}
            agentName={props.agentName}
            agentSlug={props.agentSlug}
            initialDescription={props.agentDescription}
            initialCategory={props.agentCategory}
            initialIsPublic={props.agentIsPublic}
            currentVersion={props.initialVersion}
          />
        )}
      </div>
    </div>
  );
}

function EditorTabBar({
  activeTab,
  onTabChange,
  t,
  tAgents,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  t: (key: string) => string;
  tAgents: (key: string) => string;
}) {
  const { collapsed, setCollapsed } = useAgentsSidebar();
  const { setToolbarPortal } = useEditorCache();
  const SidebarIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarLabel = collapsed ? tAgents('showSidebar') : tAgents('hideSidebar');

  const toolbarRef = useCallback((el: HTMLDivElement | null) => setToolbarPortal(el), [setToolbarPortal]);

  return (
    <GlassPanel
      variant="background"
      className="relative w-[calc(100%-(var(--spacing)*5))] rounded-full h-[41px] shrink-0 flex items-center px-2 mx-2.5 pointer-events-auto"
    >
      <Button
        variant="ghost"
        size="lg"
        className="mr-2 hover:bg-input! dark:hover:bg-input! aspect-square! px-0"
        onClick={() => setCollapsed(!collapsed)}
        title={sidebarLabel}
      >
        <SidebarIcon />
      </Button>
      <Separator orientation="vertical" className="my-2" />
      <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm border border-[0.5px] border-transparent bg-input dark:bg-input/40 dark:bg-muted/50 p-0.5 ml-5">
        {TABS.map((tab) => (
          <TabButton key={tab} tab={tab} active={activeTab === tab} onClick={onTabChange} label={t(tab)} />
        ))}
      </div>
      <div className="flex-1" />
      <div ref={toolbarRef} className={`flex items-center gap-1.5 ${activeTab !== 'agent' ? 'hidden' : ''}`} />
    </GlassPanel>
  );
}
