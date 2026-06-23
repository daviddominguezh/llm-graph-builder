'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { Edge, Node } from '@xyflow/react';
import { AlertTriangle, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { validateGraph } from '../../utils/graphValidation';
import { type McpTenantGateInput, aggregateStatusFor, hasMcpTenantErrors } from './mcpTenantGate';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type McpHealthInput = McpTenantGateInput;

interface StatusIssue {
  type: 'error' | 'warning';
  message: string;
}

interface StatusButtonProps {
  nodes: Node<RFNodeData>[];
  edges: Edge<RFEdgeData>[];
  pendingSave?: boolean;
  mcpHealth?: McpHealthInput;
  skipGraphValidation?: boolean;
}

/* ------------------------------------------------------------------ */
/*  MCP health checks                                                  */
/* ------------------------------------------------------------------ */

type Translate = (key: string, values?: Record<string, string>) => string;

function serverIssue(
  mcp: McpHealthInput,
  server: McpHealthInput['servers'][number],
  t: Translate
): StatusIssue | null {
  if (!server.enabled) {
    return { type: 'warning', message: t('mcpDisabled', { name: server.name }) };
  }
  const aggregate = aggregateStatusFor(mcp, server.id);
  if (aggregate === 'ok') return null;
  if (aggregate === 'error') {
    return { type: 'error', message: t('mcpTenantError', { name: server.name }) };
  }
  return { type: 'error', message: t('mcpTenantPending', { name: server.name }) };
}

function checkMcpHealth(mcp: McpHealthInput, t: Translate): StatusIssue[] {
  const issues: StatusIssue[] = [];
  for (const server of mcp.servers) {
    const issue = serverIssue(mcp, server, t);
    if (issue !== null) issues.push(issue);
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatusIcon({
  hasErrors,
  hasWarnings,
  saving,
}: {
  hasErrors: boolean;
  hasWarnings: boolean;
  saving: boolean;
}) {
  if (saving) return <Loader2 className="size-4 animate-spin text-orange-500" />;
  if (hasErrors) return <CircleAlert className="size-4 text-red-500" />;
  if (hasWarnings) return <AlertTriangle className="size-4 text-amber-500" />;
  return <CircleCheck className="size-4 text-green-500" />;
}

function IssueList({ issues }: { issues: StatusIssue[] }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {issues.map((issue) => (
        <li key={issue.message} className="flex items-start gap-1.5">
          {issue.type === 'error' ? (
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          )}
          <span className={issue.type === 'error' ? 'text-red-600' : 'text-amber-600'}>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  StatusButton                                                       */
/* ------------------------------------------------------------------ */

export function StatusButton({
  nodes,
  edges,
  pendingSave,
  mcpHealth,
  skipGraphValidation,
}: StatusButtonProps) {
  const t = useTranslations('status');
  const graphErrors = useMemo(
    () => (skipGraphValidation === true ? [] : validateGraph(nodes, edges)),
    [nodes, edges, skipGraphValidation]
  );
  const mcpIssues = useMemo(
    () => (mcpHealth !== undefined ? checkMcpHealth(mcpHealth, t) : []),
    [mcpHealth, t]
  );

  const allIssues: StatusIssue[] = useMemo(() => {
    const graph = graphErrors.map((e) => ({ type: 'error' as const, message: e.message }));
    return [...graph, ...mcpIssues];
  }, [graphErrors, mcpIssues]);

  const hasErrors = allIssues.some((i) => i.type === 'error');
  const hasWarnings = !hasErrors && allIssues.length > 0;
  const isOk = allIssues.length === 0;
  const saving = pendingSave === true;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="default"
            className="hover:bg-input! dark:hover:bg-input! aspect-square! px-0"
          >
            <StatusIcon hasErrors={hasErrors} hasWarnings={hasWarnings} saving={saving} />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isOk ? t('titleOk') : t('titleIssues')}</AlertDialogTitle>
          <AlertDialogDescription>
            {isOk ? t('allPassed') : t('issuesFound', { count: String(allIssues.length) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!isOk && <IssueList issues={allIssues} />}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('close')}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Returns true when there are blocking errors (any enabled server not all-tenant-ok). */
export function hasMcpErrors(mcpHealth: McpHealthInput): boolean {
  return hasMcpTenantErrors(mcpHealth);
}
