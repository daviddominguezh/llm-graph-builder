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

export interface RAGFileStatus {
  name: string;
  synched: boolean | Date;
  source: INTEGRATION_ID;
}
