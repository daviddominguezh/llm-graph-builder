import type { ExecutionMessageRow, NodeVisitRow } from '@/app/lib/dashboard';

import type { AgentDebugData, AgentStep, AgentTurn } from './agentDebugTypes';

const STEP_PREFIX = 'step-';
const FIRST_TURN = 0;

function isStepNode(nodeId: string): boolean {
  return nodeId.startsWith(STEP_PREFIX);
}

function buildStepsFromVisits(visits: NodeVisitRow[]): AgentStep[] {
  return visits
    .filter((v) => isStepNode(v.node_id))
    .map((v) => ({
      stepOrder: v.step_order,
      nodeId: v.node_id,
      visit: v,
    }));
}

function isUserMessage(msg: ExecutionMessageRow): boolean {
  return msg.role === 'user';
}

function splitByUserMessages(messages: ExecutionMessageRow[]): ExecutionMessageRow[][] {
  const groups: ExecutionMessageRow[][] = [];
  let current: ExecutionMessageRow[] = [];

  for (const msg of messages) {
    if (isUserMessage(msg) && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(msg);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function buildTurnFromGroup(group: ExecutionMessageRow[], turnIndex: number): AgentTurn {
  const userMessage = group.find(isUserMessage) ?? null;
  const assistantMessages = group.filter((m) => !isUserMessage(m));
  return { turnIndex, userMessage, assistantMessages, steps: [] };
}

function buildTurnUpperBounds(turns: AgentTurn[]): number[] {
  let messageIndex = 0;
  return turns.map((turn) => {
    const turnMessageCount = (turn.userMessage !== null ? 1 : 0) + turn.assistantMessages.length;
    messageIndex += turnMessageCount;
    return messageIndex;
  });
}

function assignStepsToTurns(turns: AgentTurn[], steps: AgentStep[]): void {
  if (turns.length === 0) return;

  const upperBounds = buildTurnUpperBounds(turns);
  let turnIdx = FIRST_TURN;

  for (const step of steps) {
    while (turnIdx < turns.length - 1 && step.stepOrder >= upperBounds[turnIdx]!) {
      turnIdx++;
    }
    const target = turns[turnIdx];
    if (target !== undefined) {
      target.steps.push(step);
    }
  }
}

export function groupTurnsAndSteps(messages: ExecutionMessageRow[], visits: NodeVisitRow[]): AgentDebugData {
  const steps = buildStepsFromVisits(visits);
  const messageGroups = splitByUserMessages(messages);
  const turns = messageGroups.map((g, i) => buildTurnFromGroup(g, i));

  assignStepsToTurns(turns, steps);

  return { turns, totalSteps: steps.length };
}
