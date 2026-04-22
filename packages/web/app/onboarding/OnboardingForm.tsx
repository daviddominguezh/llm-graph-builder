'use client';

import { Button } from '@/components/ui/button';
import type { BuildGoal, CompanySize, Industry, Referral, Role } from '@openflow/shared-validation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

import { MultiSelectSection, SingleSelectSection } from './SectionPills';
import { type OnboardingHandlers, type OnboardingState, useOnboardingState } from './useOnboardingState';

interface SectionsProps {
  state: OnboardingState;
  handlers: OnboardingHandlers;
  industryOptions: readonly Industry[];
  companySizeOptions: readonly CompanySize[];
  roleOptions: readonly Role[];
  referralOptions: readonly Referral[];
  buildGoalOptions: readonly BuildGoal[];
}

function useOptionLabel() {
  const t = useTranslations('onboarding.options');
  return {
    industry: (v: Industry) => t(`industry.${v}`),
    companySize: (v: CompanySize) => t(`companySize.${v}`),
    role: (v: Role) => t(`role.${v}`),
    referral: (v: Referral) => t(`referral.${v}`),
    buildGoal: (v: BuildGoal) => t(`buildGoals.${v}`),
  };
}

function FormSections({
  state,
  handlers,
  industryOptions,
  companySizeOptions,
  roleOptions,
  referralOptions,
  buildGoalOptions,
}: SectionsProps) {
  const t = useTranslations('onboarding.sections');
  const label = useOptionLabel();

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-3">
        <SingleSelectSection
          label={t('industry')}
          options={industryOptions}
          selected={state.industry}
          getLabel={label.industry}
          onSelect={handlers.setIndustry}
        />
        <SingleSelectSection
          label={t('companySize')}
          options={companySizeOptions}
          selected={state.companySize}
          getLabel={label.companySize}
          onSelect={handlers.setCompanySize}
        />
        <SingleSelectSection
          label={t('role')}
          options={roleOptions}
          selected={state.role}
          getLabel={label.role}
          onSelect={handlers.setRole}
        />
      </div>
      <div className="flex flex-col gap-5">
        <MultiSelectSection
          label={t('referral')}
          options={referralOptions}
          selected={state.referralSources}
          getLabel={label.referral}
          onToggle={handlers.toggleReferral}
        />
        <MultiSelectSection
          label={t('buildGoals')}
          options={buildGoalOptions}
          selected={state.buildGoals}
          getLabel={label.buildGoal}
          onToggle={handlers.toggleBuildGoal}
        />
      </div>
    </div>
  );
}

export function OnboardingForm() {
  const t = useTranslations('onboarding');
  const result = useOnboardingState();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void result.submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FormSections
        state={result.state}
        handlers={result.handlers}
        industryOptions={result.industryOptions}
        companySizeOptions={result.companySizeOptions}
        roleOptions={result.roleOptions}
        referralOptions={result.referralOptions}
        buildGoalOptions={result.buildGoalOptions}
      />
      {result.error !== null && <p className="text-destructive text-xs">{t('submitError')}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={!result.isValid || result.loading}>
          {result.loading ? <Loader2 className="size-4 animate-spin" /> : t('submit')}
        </Button>
      </div>
    </form>
  );
}
