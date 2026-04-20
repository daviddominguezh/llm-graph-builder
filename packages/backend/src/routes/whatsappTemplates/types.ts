export interface WhatsAppTemplateVariable {
  key: string;
  name: string;
  example: string;
  required: boolean;
}

export type WhatsAppTemplateCategory = 'utility' | 'marketing' | 'authentication';

export type WhatsAppTemplateStatus = 'approved' | 'pending' | 'rejected' | 'paused' | 'deactivated';

export interface WhatsAppTemplateRow {
  id: string;
  org_id: string;
  channel_connection_id: string;
  meta_template_id: string | null;
  name: string;
  body: string;
  language: string;
  variables: WhatsAppTemplateVariable[];
  category: WhatsAppTemplateCategory;
  description: string | null;
  status: WhatsAppTemplateStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequestBody {
  channelConnectionId: string;
  name: string;
  body: string;
  language: string;
  variables: WhatsAppTemplateVariable[];
  category: WhatsAppTemplateCategory;
  description: string | null;
}
