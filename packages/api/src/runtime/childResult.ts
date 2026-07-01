export type ChildErrorCode =
  | 'max_depth_exceeded'
  | 'child_failed'
  | 'no_result'
  | 'timeout'
  | 'agent_not_published'
  | 'aborted';

export type ChildResult =
  | { status: 'finished'; result: string; outcome: 'success' | 'error' }
  | { status: 'awaiting_input'; partial: string }
  | { status: 'error'; code: ChildErrorCode; message: string };
