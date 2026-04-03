export interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}
