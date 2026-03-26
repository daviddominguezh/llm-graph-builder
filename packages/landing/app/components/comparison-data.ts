export type CellValue = 'yes' | 'no' | 'partial' | 'basic';

export interface ComparisonRow {
  feature: string;
  openflow: CellValue;
  dify: CellValue;
  langflow: CellValue;
  n8n: CellValue;
  langsmith: CellValue;
}

export const ROWS: ComparisonRow[] = [
  { feature: 'Visual agent builder', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'yes' },
  { feature: 'Multi-tenant isolation', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'no', langsmith: 'no' },
  { feature: 'Per-tenant channels', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'partial', langsmith: 'no' },
  {
    feature: 'Per-tenant cost tracking',
    openflow: 'yes',
    dify: 'no',
    langflow: 'no',
    n8n: 'no',
    langsmith: 'no',
  },
  {
    feature: 'Any LLM via OpenRouter',
    openflow: 'yes',
    dify: 'partial',
    langflow: 'partial',
    n8n: 'partial',
    langsmith: 'partial',
  },
  {
    feature: 'MCP tool support',
    openflow: 'yes',
    dify: 'no',
    langflow: 'yes',
    n8n: 'partial',
    langsmith: 'yes',
  },
  { feature: 'API-first execution', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'yes' },
  {
    feature: 'Built-in observability',
    openflow: 'yes',
    dify: 'basic',
    langflow: 'basic',
    n8n: 'basic',
    langsmith: 'yes',
  },
  { feature: 'Open source', openflow: 'yes', dify: 'yes', langflow: 'yes', n8n: 'yes', langsmith: 'no' },
  { feature: 'Built for SaaS resale', openflow: 'yes', dify: 'no', langflow: 'no', n8n: 'no', langsmith: 'no' },
];

export const COMPETITORS = ['OpenFlow', 'Dify', 'Langflow', 'n8n', 'LangSmith'] as const;

export const COMPETITOR_KEYS = ['openflow', 'dify', 'langflow', 'n8n', 'langsmith'] as const;

export type CompetitorKey = (typeof COMPETITOR_KEYS)[number];
