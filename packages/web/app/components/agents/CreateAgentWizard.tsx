'use client';

import { createAgentAction } from '@/app/actions/agents';
import { useSlugAvailability } from '@/app/hooks/useSlugAvailability';
import type { TemplatesPrefetchState } from '@/app/hooks/useTemplatesPrefetch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type AppType, AppTypeCards } from './AppTypeCards';
import { type DetailsFormState, DetailsStep } from './DetailsStep';
import { TemplateGrid, type TemplateSelection } from './TemplateGrid';
import { TemplatePreviewModal } from './TemplatePreviewModal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WizardStep = 'template' | 'details';

interface CreateAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
  prefetchedTemplates: TemplatesPrefetchState;
}

interface PreviewState {
  agentId: string | null;
  version: number | null;
  open: boolean;
}

/* ------------------------------------------------------------------ */
/*  Initial state helpers                                              */
/* ------------------------------------------------------------------ */

const INITIAL_DETAILS: DetailsFormState = {
  name: '',
  description: '',
  category: '',
  isPublic: false,
};

const INITIAL_PREVIEW: PreviewState = { agentId: null, version: null, open: false };

/* ------------------------------------------------------------------ */
/*  TemplateStep                                                       */
/* ------------------------------------------------------------------ */

interface TemplateStepProps {
  selection: TemplateSelection | null;
  onSelectionChange: (s: TemplateSelection) => void;
  onPreview: (agentId: string, version: number) => void;
  onNext: () => void;
  prefetchedTemplates: TemplatesPrefetchState;
  appType: AppType | null;
  onAppTypeChange: (type: AppType | null) => void;
}

function TemplateStep(props: TemplateStepProps) {
  const { selection, onSelectionChange, onPreview, onNext, prefetchedTemplates, appType, onAppTypeChange } =
    props;
  const t = useTranslations('marketplace');
  const canProceed = appType !== null && selection !== null;

  return (
    <>
      <div className={`flex ${appType !== null ? 'mb-2.5' : 'flex-1 mb-4'}`}>
        <AppTypeCards value={appType} onChange={onAppTypeChange} />
      </div>
      {appType !== null && (
        <TemplateGrid
          selection={selection}
          onSelectionChange={onSelectionChange}
          onPreview={onPreview}
          prefetchedTemplates={prefetchedTemplates}
          appType={appType}
        />
      )}
      <DialogFooter className="shrink-0">
        <Button onClick={onNext} disabled={!canProceed}>
          {t('next')}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook: wizard state                                                 */
/* ------------------------------------------------------------------ */

function useWizardState() {
  const [step, setStep] = useState<WizardStep>('template');
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [appType, setAppType] = useState<AppType | null>(null);
  const [details, setDetails] = useState<DetailsFormState>(INITIAL_DETAILS);
  const [preview, setPreview] = useState<PreviewState>(INITIAL_PREVIEW);
  const [loading, setLoading] = useState(false);

  const reset = useCallback(() => {
    setStep('template');
    setSelection(null);
    setAppType(null);
    setDetails(INITIAL_DETAILS);
    setPreview(INITIAL_PREVIEW);
    setLoading(false);
  }, []);

  return {
    step,
    setStep,
    selection,
    setSelection,
    appType,
    setAppType,
    details,
    setDetails,
    preview,
    setPreview,
    loading,
    setLoading,
    reset,
  };
}

/* ------------------------------------------------------------------ */
/*  Submit handler                                                     */
/* ------------------------------------------------------------------ */

async function submitWizard(
  orgId: string,
  orgSlug: string,
  details: DetailsFormState,
  selection: TemplateSelection | null,
  appType: AppType | null,
  setLoading: (v: boolean) => void,
  onSuccess: (slug: string) => void
) {
  setLoading(true);

  const { agent, error } = await createAgentAction({
    orgId,
    name: details.name.trim(),
    description: details.description.trim(),
    category: details.category,
    isPublic: details.isPublic,
    appType: appType ?? 'workflow',
    templateAgentId: selection?.type === 'template' ? selection.agentId : undefined,
    templateVersion: selection?.type === 'template' ? selection.version : undefined,
  });

  if (error !== null || agent === null) {
    setLoading(false);
    toast.error(error ?? 'Failed to create agent');
    return;
  }

  onSuccess(agent.slug);
}

/* ------------------------------------------------------------------ */
/*  Wizard content                                                     */
/* ------------------------------------------------------------------ */

function WizardBody({
  state,
  orgId,
  orgSlug,
  onClose,
  prefetchedTemplates,
}: {
  state: ReturnType<typeof useWizardState>;
  orgId: string;
  orgSlug: string;
  onClose: () => void;
  prefetchedTemplates: TemplatesPrefetchState;
}) {
  const router = useRouter();
  const t = useTranslations('marketplace');
  const title = state.step === 'template' ? t('step1Title') : t('step2Title');
  const { checking, available } = useSlugAvailability(state.details.name, 'agents');

  const handlePreview = useCallback(
    (agentId: string, version: number) => {
      state.setPreview({ agentId, version, open: true });
    },
    [state]
  );

  const handleAppTypeChange = useCallback(
    (type: AppType | null) => {
      state.setAppType(type);
      state.setSelection(null);
    },
    [state]
  );

  const handleSubmit = useCallback(() => {
    void submitWizard(
      orgId,
      orgSlug,
      state.details,
      state.selection,
      state.appType,
      state.setLoading,
      (slug) => {
        onClose();
        router.push(`/orgs/${orgSlug}/editor/${slug}`);
      }
    );
  }, [orgId, orgSlug, state, onClose, router]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div
        key={state.step}
        className="min-w-0 animate-in fade-in duration-200 max-h-[69vh] min-h-[69vh] flex flex-col flex-1 min-h-[0px]"
      >
        {state.step === 'template' ? (
          <TemplateStep
            selection={state.selection}
            onSelectionChange={state.setSelection}
            onPreview={handlePreview}
            onNext={() => state.setStep('details')}
            prefetchedTemplates={prefetchedTemplates}
            appType={state.appType}
            onAppTypeChange={handleAppTypeChange}
          />
        ) : (
          <DetailsStep
            state={state.details}
            onChange={state.setDetails}
            onBack={() => state.setStep('template')}
            onSubmit={handleSubmit}
            loading={state.loading}
            checking={checking}
            available={available}
          />
        )}
      </div>
      <TemplatePreviewModal
        open={state.preview.open}
        onOpenChange={(v) => state.setPreview((prev) => ({ ...prev, open: v }))}
        agentId={state.preview.agentId}
        version={state.preview.version}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  CreateAgentWizard                                                  */
/* ------------------------------------------------------------------ */

export function CreateAgentWizard({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  prefetchedTemplates,
}: CreateAgentWizardProps) {
  const state = useWizardState();

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) state.reset();
      onOpenChange(next);
    },
    [onOpenChange, state]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl overflow-hidden">
        <WizardBody
          state={state}
          orgId={orgId}
          orgSlug={orgSlug}
          onClose={() => handleOpenChange(false)}
          prefetchedTemplates={prefetchedTemplates}
        />
      </DialogContent>
    </Dialog>
  );
}
