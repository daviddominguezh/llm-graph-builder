'use client';

import type { McpTransport } from '@/app/schemas/graph.schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { analyzeTemplate, transportEndpointFields, withUpdatedEndpoint } from './templateAnalysis';

export { analyzeTemplate } from './templateAnalysis';
export type { TemplateAnalysis } from './templateAnalysis';

function ColumnBadges({ columns }: { columns: string[] }) {
  if (columns.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {columns.map((name) => (
        <Badge key={name} variant="outline" className="font-mono text-[11px]">
          {`{{${name}}}`}
        </Badge>
      ))}
    </div>
  );
}

function MalformedNote({ malformed }: { malformed: string[] }) {
  const t = useTranslations('mcpMatrix');
  if (malformed.length === 0) return null;
  return (
    <p className="flex items-start gap-1 text-xs text-amber-600">
      <AlertTriangle className="size-3.5 shrink-0 translate-y-px" />
      <span>{`${t('needsConfig')}: ${malformed.join(', ')}`}</span>
    </p>
  );
}

interface EndpointInputsProps {
  transport: McpTransport;
  onTemplateChange: (transport: McpTransport) => void;
}

function EndpointInputs({ transport, onTemplateChange }: EndpointInputsProps) {
  return (
    <>
      {transportEndpointFields(transport).map((field) => (
        <div key={field.label} className="space-y-1">
          <Label>{field.label}</Label>
          <Input
            value={field.value}
            onChange={(e) => onTemplateChange(withUpdatedEndpoint(transport, field.label, e.target.value))}
            placeholder="https://example.com/{{TENANT}}/mcp"
          />
        </div>
      ))}
    </>
  );
}

export interface McpServerDefinitionSectionProps {
  transport: McpTransport;
  onTemplateChange: (transport: McpTransport) => void;
}

export function McpServerDefinitionSection({ transport, onTemplateChange }: McpServerDefinitionSectionProps) {
  const t = useTranslations('mcpMatrix');
  const { columns, malformed } = analyzeTemplate(transport);

  return (
    <details className="group rounded-md border bg-muted/30 px-3 py-2" open>
      <summary className="cursor-pointer select-none text-xs font-semibold">{t('definitionHeader')}</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t('definitionHelp')}</p>
        <EndpointInputs transport={transport} onTemplateChange={onTemplateChange} />
        <ColumnBadges columns={columns} />
        <MalformedNote malformed={malformed} />
      </div>
    </details>
  );
}
