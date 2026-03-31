export enum INTEGRATION_ID {
  DRIVE = 'drive',
  GCALENDAR = 'google-calendar',
  GMAIL = 'gmail',
  GITHUB = 'github',
  SLACK = 'slack',
  JIRA = 'jira',
  NOTION = 'notion',
  SHOPIFY = 'shopify',
  INSTAGRAM = 'instagram',
}

export interface RAGRecord {
  name: string;
  integration: INTEGRATION_ID;
}

export type Records = Record<string, RAGRecord>;

export interface Chunk {
  id: string;
  text: string;
}

export interface RAGRecordDetail {
  chunks: Chunk[];
  timestamp: Date;
}

export interface RAGRecordDetailError {
  error: string;
}

export type RecordsDetail = Record<string, RAGRecordDetail | RAGRecordDetailError>;
