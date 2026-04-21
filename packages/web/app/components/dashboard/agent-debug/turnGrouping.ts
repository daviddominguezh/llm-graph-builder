import type { ExecutionMessageRow, NodeVisitRow } from '@/app/lib/dashboard';

import type { AgentDebugData, AgentStep, AgentTurn } from './agentDebugTypes';

const STEP_PREFIX = 'step-';
const FIRST_TURN = 0;
const EMPTY_LENGTH = 0;
const USER_MSG_COUNT = 1;
const LAST_OFFSET = 1;

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
    if (isUserMessage(msg) && current.length > EMPTY_LENGTH) {
      groups.push(current);
      current = [];
    }
    current.push(msg);
  }

  if (current.length > EMPTY_LENGTH) {
    groups.push(current);
  }

  return groups;
}

function buildTurnFromGroup(group: ExecutionMessageRow[], turnIndex: number): AgentTurn {
  const userMessage = group.find(isUserMessage) ?? null;
  const assistantMessages = group.filter((m) => !isUserMessage(m));
  return { turnIndex, userMessage, assistantMessages, steps: [] };
}

function countUserMessages(turn: AgentTurn): number {
  return turn.userMessage === null ? EMPTY_LENGTH : USER_MSG_COUNT;
}

function buildTurnUpperBounds(turns: AgentTurn[]): number[] {
  let messageIndex = EMPTY_LENGTH;
  return turns.map((turn) => {
    const turnMessageCount = countUserMessages(turn) + turn.assistantMessages.length;
    messageIndex += turnMessageCount;
    return messageIndex;
  });
}

function shouldAdvance(idx: number, step: AgentStep, upperBounds: number[]): boolean {
  const { [idx]: bound } = upperBounds;
  return step.stepOrder >= bound;
}

function advanceTurnPointer(
  turnIdx: number,
  step: AgentStep,
  turns: AgentTurn[],
  upperBounds: number[]
): number {
  let idx = turnIdx;
  const lastTurnIdx = turns.length - LAST_OFFSET;
  while (idx < lastTurnIdx && shouldAdvance(idx, step, upperBounds)) {
    idx += LAST_OFFSET;
  }
  return idx;
}

function pushStepToTurn(turns: AgentTurn[], turnIdx: number, step: AgentStep): void {
  const { [turnIdx]: target } = turns;
  target.steps.push(step);
}

function assignStepsToTurns(turns: AgentTurn[], steps: AgentStep[]): void {
  if (turns.length === EMPTY_LENGTH) return;

  const upperBounds = buildTurnUpperBounds(turns);
  let turnIdx = FIRST_TURN;

  for (const step of steps) {
    turnIdx = advanceTurnPointer(turnIdx, step, turns, upperBounds);
    pushStepToTurn(turns, turnIdx, step);
  }
}

export function groupTurnsAndSteps(messages: ExecutionMessageRow[], visits: NodeVisitRow[]): AgentDebugData {
  const steps = buildStepsFromVisits(visits);
  const messageGroups = splitByUserMessages(messages);
  const turns = messageGroups.map((g, i) => buildTurnFromGroup(g, i));

  assignStepsToTurns(turns, steps);

  return { turns, totalSteps: steps.length };
}
