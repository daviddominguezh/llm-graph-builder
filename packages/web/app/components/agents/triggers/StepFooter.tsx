'use client';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

interface StepFooterProps {
  step: 'schedule' | 'message';
  messageEmpty: boolean;
  onCancel: () => void;
  onNext: () => void;
  onBack: () => void;
  onSave: () => void;
}

function ScheduleFooter({ onCancel, onNext, t }: Pick<StepFooterProps, 'onCancel' | 'onNext'> & Translate) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onCancel} className="rounded-md">
        {t('cancel')}
      </Button>
      <Button onClick={onNext} className="rounded-md">
        {t('next')}
      </Button>
    </DialogFooter>
  );
}

function MessageFooter({
  messageEmpty,
  onBack,
  onSave,
  t,
}: Pick<StepFooterProps, 'messageEmpty' | 'onBack' | 'onSave'> & Translate) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onBack} className="rounded-md">
        {t('back')}
      </Button>
      <Button onClick={onSave} disabled={messageEmpty} className="rounded-md">
        {t('create')}
      </Button>
    </DialogFooter>
  );
}

interface Translate {
  t: ReturnType<typeof useTranslations<'editor.triggers'>>;
}

export function StepFooter(props: StepFooterProps) {
  const t = useTranslations('editor.triggers');
  if (props.step === 'schedule') {
    return <ScheduleFooter onCancel={props.onCancel} onNext={props.onNext} t={t} />;
  }
  return (
    <MessageFooter messageEmpty={props.messageEmpty} onBack={props.onBack} onSave={props.onSave} t={t} />
  );
}
