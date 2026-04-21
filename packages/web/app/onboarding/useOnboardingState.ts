'use client';

import {
  BUILD_GOAL_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  INDUSTRY_OPTIONS,
  REFERRAL_OPTIONS,
  ROLE_OPTIONS,
  type BuildGoal,
  type CompanySize,
  type Industry,
  type Referral,
  type Role,
} from '@openflow/shared-validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MIN_ARRAY_LENGTH = 1;

export interface OnboardingState {
  industry: Industry | null;
  companySize: CompanySize | null;
  role: Role | null;
  referralSources: Referral[];
  buildGoals: BuildGoal[];
}

export interface OnboardingHandlers {
  setIndustry: (v: Industry) => void;
  setCompanySize: (v: CompanySize) => void;
  setRole: (v: Role) => void;
  toggleReferral: (v: Referral) => void;
  toggleBuildGoal: (v: BuildGoal) => void;
}

export interface UseOnboardingStateResult {
  state: OnboardingState;
  handlers: OnboardingHandlers;
  isValid: boolean;
  loading: boolean;
  error: string | null;
  submit: () => Promise<void>;
  industryOptions: readonly Industry[];
  companySizeOptions: readonly CompanySize[];
  roleOptions: readonly Role[];
  referralOptions: readonly Referral[];
  buildGoalOptions: readonly BuildGoal[];
}

function isFormValid(state: OnboardingState): boolean {
  return (
    state.industry !== null &&
    state.companySize !== null &&
    state.role !== null &&
    state.referralSources.length >= MIN_ARRAY_LENGTH &&
    state.buildGoals.length >= MIN_ARRAY_LENGTH
  );
}

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function useOnboardingState(): UseOnboardingStateResult {
  const router = useRouter();

  const [state, setState] = useState<OnboardingState>({
    industry: null,
    companySize: null,
    role: null,
    referralSources: [],
    buildGoals: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlers: OnboardingHandlers = {
    setIndustry: (v) => setState((s) => ({ ...s, industry: v })),
    setCompanySize: (v) => setState((s) => ({ ...s, companySize: v })),
    setRole: (v) => setState((s) => ({ ...s, role: v })),
    toggleReferral: (v) => setState((s) => ({ ...s, referralSources: toggleItem(s.referralSources, v) })),
    toggleBuildGoal: (v) => setState((s) => ({ ...s, buildGoals: toggleItem(s.buildGoals, v) })),
  };

  async function submit(): Promise<void> {
    setLoading(true);
    setError(null);

    const body = {
      industry: state.industry,
      company_size: state.companySize,
      role: state.role,
      referral_sources: state.referralSources,
      build_goals: state.buildGoals,
    };

    const res = await fetch('/api/auth/complete-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError('onboarding.submitError');
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return {
    state,
    handlers,
    isValid: isFormValid(state),
    loading,
    error,
    submit,
    industryOptions: INDUSTRY_OPTIONS,
    companySizeOptions: COMPANY_SIZE_OPTIONS,
    roleOptions: ROLE_OPTIONS,
    referralOptions: REFERRAL_OPTIONS,
    buildGoalOptions: BUILD_GOAL_OPTIONS,
  };
}
