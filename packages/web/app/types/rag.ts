export interface RAGQueryResult {
  id: string;
  kind: string;
  name: string;
  score: number;
  page: number;
  text: string;
}

export type RAGQueryResults = RAGQueryResult[];
