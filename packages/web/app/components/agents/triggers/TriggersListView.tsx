'use client';

import { Scrollable } from '@/app/components/Scrollable';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TriggerRow } from './TriggerRow';
import type { Trigger } from './types';

interface TriggersListViewProps {
  triggers: Trigger[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function ListCardHeader({ count, onAdd }: { count: number; onAdd: () => void }) {
  const t = useTranslations('editor.triggers');
  return (
    <CardHeader>
      <CardTitle className="flex items-center">
        {t('title')}
        {count > 0 && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">{count}</span>
        )}
      </CardTitle>
      <CardDescription>{t('description')}</CardDescription>
      <CardAction>
        <Button variant="outline" size="sm" className="border-[0.5px] rounded-md" onClick={onAdd}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </CardAction>
    </CardHeader>
  );
}

function EmptyList({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-background px-4 py-8 text-center">
      <Zap className="size-6 text-muted-foreground/50" />
      <p className="text-sm font-medium">{t('empty')}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{t('emptyDescription')}</p>
      <Button size="sm" className="mt-2 rounded-full" onClick={onAdd}>
        <Plus className="size-3.5" />
        {t('add')}
      </Button>
    </div>
  );
}

function TriggersList({ triggers, onEdit, onDelete }: Omit<TriggersListViewProps, 'onAdd'>) {
  return (
    <div className="flex flex-col gap-2">
      {triggers.map((trigger) => (
        <TriggerRow
          key={trigger.id}
          trigger={trigger}
          onClick={() => onEdit(trigger.id)}
          onDelete={() => onDelete(trigger.id)}
        />
      ))}
    </div>
  );
}

export function TriggersListView(props: TriggersListViewProps) {
  return (
    <Scrollable className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
        <Card className="bg-background ring-0">
          <ListCardHeader count={props.triggers.length} onAdd={props.onAdd} />
          <CardContent>
            {props.triggers.length === 0 ? (
              <EmptyList onAdd={props.onAdd} />
            ) : (
              <TriggersList
                triggers={props.triggers}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </Scrollable>
  );
}
