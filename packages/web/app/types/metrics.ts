type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
type Hour =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'
  | '13'
  | '14'
  | '15'
  | '16'
  | '17'
  | '18'
  | '19'
  | '20'
  | '21'
  | '22'
  | '23';

export interface Metrics {
  sales: Array<{ date: string; sales: number }>;
  days: Array<{ date: string; day: Day; messages: number }>;
  hours: Array<{ hour: Hour; messages: number }>;
  totalMessages: {
    value: number;
    fluctuation: number;
  };
  messagesOffhours: {
    value: number;
    fluctuation: number;
  };
  messagesCloser: {
    value: number;
    fluctuation: number;
  };
  totalUsers: {
    value: number;
    fluctuation: number;
  };
  totalLeads: {
    value: number;
    fluctuation: number;
  };
  conversionRate: {
    value: number;
    fluctuation: number;
  };
  salesOffhours: {
    value: number;
    fluctuation: number;
  };
  avgResponseTime: {
    value: number;
    fluctuation: number;
  };
  chatsLeft: {
    value: number;
    fluctuation: number;
  };
}
