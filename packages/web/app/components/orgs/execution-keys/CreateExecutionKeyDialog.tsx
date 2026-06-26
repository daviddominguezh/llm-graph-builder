'use client';

import { createExecutionKeyAction } from '@/app/actions/executionKeys';
import type { AgentMetadata } from '@/app/lib/agents';
import type { ExecutionKeyRow } from '@/app/lib/executionKeys';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  AllAgentsToggle,
  AllTenantsToggle,
  type ScopeOption,
  ScopeMultiSelect,
} from './ScopeSelectors';

interface CreateExecutionKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  agents: AgentMetadata[];
  tenants: TenantRow[];
  onCreated: (result: { key: ExecutionKeyRow; fullKey: string }) => void;
}

interface FormErrors {
  nameError: string;
  agentsError: string;
  tenantsError: string;
}

function emptyErrors(): FormErrors {
  return { nameError: '', agentsError: '', tenantsError: '' };
}

function buildAgentOptions(agents: AgentMetadata[]): ScopeOption[] {
  return agents.map((a) => ({ value: a.id, label: a.name }));
}

function buildTenantOptions(tenants: TenantRow[]): ScopeOption[] {
  return tenants.map((t) => ({ value: t.id, label: t.name }));
}

interface ValidateArgs {
  name: string;
  allAgents: boolean;
  agentIds: string[];
  allTenants: boolean;
  tenantIds: string[];
  t: (key: string) => string;
}

function validateForm(args: ValidateArgs): FormErrors | null {
  const nameError = args.name === '' ? args.t('nameRequired') : '';
  const agentsError = !args.allAgents && args.agentIds.length === 0 ? args.t('agentsRequired') : '';
  const tenantsError = !args.allTenants && args.tenantIds.length === 0 ? args.t('tenantsRequired') : '';

  if (nameError !== '' || agentsError !== '' || tenantsError !== '') {
    return { nameError, agentsError, tenantsError };
  }
  return null;
}

function NameField({ error }: { error: string }) {
  const t = useTranslations('executionKeys');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="exec-key-name">{t('name')}</Label>
      <Input id="exec-key-name" name="name" placeholder={t('namePlaceholder')} required autoFocus />
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function ExpirationField() {
  const t = useTranslations('executionKeys');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="exec-key-expires">{t('expiresAt')}</Label>
      <p className="text-muted-foreground text-xs">{t('expiresAtDescription')}</p>
      <Input id="exec-key-expires" name="expiresAt" type="date" />
    </div>
  );
}

interface FormState {
  allAgents: boolean;
  allTenants: boolean;
  selectedAgents: ScopeOption[];
  selectedTenants: ScopeOption[];
}

interface SubmitArgs {
  orgId: string;
  state: FormState;
  onCreated: CreateExecutionKeyDialogProps['onCreated'];
}

function useCreateKeyForm(args: SubmitArgs) {
  const t = useTranslations('executionKeys');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>(emptyErrors());

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const expiresAt = (formData.get('expiresAt') as string) || null;
    const agentIds = args.state.selectedAgents.map((a) => a.value);
    const tenantIds = args.state.selectedTenants.map((t2) => t2.value);

    const validationErrors = validateForm({
      name,
      allAgents: args.state.allAgents,
      agentIds,
      allTenants: args.state.allTenants,
      tenantIds,
      t,
    });
    if (validationErrors !== null) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors(emptyErrors());

    const { result, error } = await createExecutionKeyAction({
      orgId: args.orgId,
      name,
      allAgents: args.state.allAgents,
      agentIds,
      allTenants: args.state.allTenants,
      tenantIds,
      expiresAt,
    });
    setLoading(false);

    if (error !== null || result === null) {
      toast.error(error ?? t('createError'));
      return;
    }
    args.onCreated(result);
  }

  function resetErrors() {
    setErrors(emptyErrors());
  }

  return { loading, errors, handleSubmit, resetErrors };
}

interface ScopeSectionsProps {
  agentOptions: ScopeOption[];
  tenantOptions: ScopeOption[];
  state: FormState;
  setState: (updater: (prev: FormState) => FormState) => void;
  errors: FormErrors;
}

function ScopeSections({ agentOptions, tenantOptions, state, setState, errors }: ScopeSectionsProps) {
  const t = useTranslations('executionKeys');
  return (
    <>
      <AllAgentsToggle
        checked={state.allAgents}
        onCheckedChange={(v) => setState((prev) => ({ ...prev, allAgents: v }))}
      />
      {!state.allAgents && (
        <ScopeMultiSelect
          id="exec-key-agents"
          label={t('agents')}
          description={t('agentsDescription')}
          placeholder={t('agentsPlaceholder')}
          options={agentOptions}
          selected={state.selectedAgents}
          onSelectedChange={(values) => setState((prev) => ({ ...prev, selectedAgents: values }))}
          error={errors.agentsError}
        />
      )}
      <AllTenantsToggle
        checked={state.allTenants}
        onCheckedChange={(v) => setState((prev) => ({ ...prev, allTenants: v }))}
      />
      {!state.allTenants && (
        <ScopeMultiSelect
          id="exec-key-tenants"
          label={t('tenants')}
          description={t('tenantsDescription')}
          placeholder={t('tenantsPlaceholder')}
          options={tenantOptions}
          selected={state.selectedTenants}
          onSelectedChange={(values) => setState((prev) => ({ ...prev, selectedTenants: values }))}
          error={errors.tenantsError}
        />
      )}
    </>
  );
}

function useDialogState() {
  const [state, setState] = useState<FormState>({
    allAgents: true,
    allTenants: true,
    selectedAgents: [],
    selectedTenants: [],
  });
  return { state, setState };
}

export function CreateExecutionKeyDialog({
  open,
  onOpenChange,
  orgId,
  agents,
  tenants,
  onCreated,
}: CreateExecutionKeyDialogProps) {
  const t = useTranslations('executionKeys');
  const agentOptions = useMemo(() => buildAgentOptions(agents), [agents]);
  const tenantOptions = useMemo(() => buildTenantOptions(tenants), [tenants]);
  const { state, setState } = useDialogState();
  const { loading, errors, handleSubmit, resetErrors } = useCreateKeyForm({ orgId, state, onCreated });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setState({ allAgents: true, allTenants: true, selectedAgents: [], selectedTenants: [] });
        resetErrors();
      }
      onOpenChange(next);
    },
    [onOpenChange, resetErrors, setState]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <NameField error={errors.nameError} />
          <ScopeSections
            agentOptions={agentOptions}
            tenantOptions={tenantOptions}
            state={state}
            setState={setState}
            errors={errors}
          />
          <ExpirationField />
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <LoaderCircle className="size-4 animate-spin" />}
              {loading ? t('creating') : t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
