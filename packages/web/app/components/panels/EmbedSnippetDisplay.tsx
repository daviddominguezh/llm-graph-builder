'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { CopyButton } from './PublishButtonShared';

const WIDGET_DOMAIN = 'live.openflow.build';

export function buildEmbedScript(tenantSlug: string, agentSlug: string): string {
  return `<script src="https://${tenantSlug}-${agentSlug}.${WIDGET_DOMAIN}/script.js" async></script>`;
}

interface EmbedSnippetDisplayProps {
  tenantSlug: string;
  agentSlug: string;
  disabled?: boolean;
}

function EmbedHighlighter({ snippet, disabled }: { snippet: string; disabled: boolean }) {
  const { resolvedTheme } = useTheme();
  const syntaxTheme = resolvedTheme === 'dark' ? oneDark : oneLight;

  return (
    <SyntaxHighlighter
      language="html"
      style={syntaxTheme}
      customStyle={{
        margin: 0,
        borderRadius: '0.375rem',
        fontSize: '11px',
        lineHeight: '1.625',
        padding: '0.625rem',
        wordBreak: 'break-all',
        whiteSpace: 'pre-wrap',
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity 150ms',
      }}
    >
      {snippet}
    </SyntaxHighlighter>
  );
}

export function EmbedSnippetDisplay({ tenantSlug, agentSlug, disabled = false }: EmbedSnippetDisplayProps) {
  const t = useTranslations('editor');
  const snippet = buildEmbedScript(tenantSlug, agentSlug);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{t('embedScript')}</span>
        <CopyButton text={snippet} disabled={disabled} />
      </div>
      <EmbedHighlighter snippet={snippet} disabled={disabled} />
    </div>
  );
}
