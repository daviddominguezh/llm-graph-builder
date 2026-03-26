export interface TokenLog {
  input: number;
  output: number;
  cached: number;
  costUSD?: number;
}

export interface ActionTokenUsage {
  action: string;
  tokens: TokenLog;
}

interface Cost {
  costCOP: number;
  costUSD: number;
}

interface Action {
  input: number;
  cached: number;
  output: number;
  date: string;
  model: string;
  userID: string;
  cost: Cost;
}

type ActionRecords = Record<string, Action>;

type ActionLogs = Record<string, ActionRecords>;

interface ReplyRecord {
  action: ActionLogs;
  cost: Cost;
}

export type ReplyLog = Record<string, ReplyRecord>;
