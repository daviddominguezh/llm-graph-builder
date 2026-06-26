import { type SelectedTool, equalsSelectedTool } from '@daviddh/llm-graph-runner';

export type GroupHeaderState = 'checked' | 'unchecked' | 'indeterminate';

export function isToolSelected(selected: SelectedTool[], tool: SelectedTool): boolean {
  return selected.some((s) => equalsSelectedTool(s, tool));
}

export function toggleTool(selected: SelectedTool[], tool: SelectedTool): SelectedTool[] {
  if (isToolSelected(selected, tool)) {
    return selected.filter((s) => !equalsSelectedTool(s, tool));
  }
  return [...selected, tool];
}

export interface ComputeHeaderArgs {
  groupTools: SelectedTool[];
  selected: SelectedTool[];
}

export function computeHeaderState(args: ComputeHeaderArgs): GroupHeaderState {
  if (args.groupTools.length === 0) return 'unchecked';
  const present = args.groupTools.filter((t) => isToolSelected(args.selected, t)).length;
  if (present === 0) return 'unchecked';
  if (present === args.groupTools.length) return 'checked';
  return 'indeterminate';
}

export interface FindStaleArgs {
  selections: SelectedTool[];
  registry: SelectedTool[];
  failedProviders: string[];
}

export function findStaleSelections(args: FindStaleArgs): SelectedTool[] {
  const failed = new Set(args.failedProviders);
  return args.selections.filter((s) => {
    if (failed.has(s.providerId)) return false;
    return !args.registry.some((r) => equalsSelectedTool(r, s));
  });
}
