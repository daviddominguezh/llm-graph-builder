'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Rendered next to tools/tool-calls where `providerType === 'mcp'`: MCP tools run
// for real during simulation, so their calls have real side effects (RU3 §8).
export function McpSideEffectBadge(): React.JSX.Element {
  const t = useTranslations('simulation');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-600 dark:border-amber-400/60 dark:text-amber-400"
            aria-label={t('mcpBadge.tooltip')}
          >
            <AlertTriangle className="size-2.5" />
            {t('mcpBadge.label')}
          </Badge>
        }
      />
      <TooltipContent side="top">{t('mcpBadge.tooltip')}</TooltipContent>
    </Tooltip>
  );
}
