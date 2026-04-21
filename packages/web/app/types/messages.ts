import { LastMessage } from './chat';

export interface MessageFetchingStatus {
  requestId: string;
  data: LastMessage;
}
