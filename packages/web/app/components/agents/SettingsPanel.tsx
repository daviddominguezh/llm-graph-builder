'use client';

import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import { VisibilityToggle } from './VisibilityToggle';
import { CategorySection } from './settings/CategorySection';
import { DangerZone } from './settings/DangerZone';
import { DescriptionSection } from './settings/DescriptionSection';

interface SettingsPanelProps {
  agentId: string;
  agentName: string;
  agentSlug: string;
  initialDescription: string;
  initialCategory: string;
  initialIsPublic: boolean;
  currentVersion: number;
  extraContent?: React.ReactNode;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const t = useTranslations('settings');

  return (
    <div className="flex flex-col p-6 h-full overflow-y-scroll py-12 px-[240px]">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <Separator className="my-0" />
        <DescriptionSection agentId={props.agentId} initialDescription={props.initialDescription} />
        <Separator className="my-0" />
        <CategorySection agentId={props.agentId} initialCategory={props.initialCategory} />
        <Separator className="my-0" />
        <div className="flex flex-col gap-2 my-1">
          <Label>{t('visibility')}</Label>
          <VisibilityToggle
            agentId={props.agentId}
            currentVersion={props.currentVersion}
            initialIsPublic={props.initialIsPublic}
          />
        </div>
        <Separator className="my-0" />
        {props.extraContent}
        <Separator className="my-0" />
        <DangerZone agentId={props.agentId} agentName={props.agentName} agentSlug={props.agentSlug} />
      </div>
    </div>
  );
}
