import type { PublicExecutionEvent } from '../types/publicEvents.js';
import type { CopilotMessageBlock } from '../ui/copilotTypes.js';

function humanize(name: string): string {
  return name.replace(/_/gv, ' ').replace(/\b\w/gv, (c) => c.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractTitle(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  return typeof args.title === 'string' ? args.title : undefined;
}

function extractDescription(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  return typeof args.description === 'string' ? args.description : undefined;
}

function describeResult(result: unknown): string {
  if (!isRecord(result)) return '';
  return typeof result.description === 'string' ? result.description : '';
}

function makeToolBlock(ev: { name: string; args: unknown; result: unknown }): CopilotMessageBlock {
  const title = extractTitle(ev.args) ?? humanize(ev.name);
  const description = extractDescription(ev.args) ?? describeResult(ev.result);
  return { type: 'action', icon: 'plus-circle', title, description };
}

export class BlockCoalescer {
  private readonly blocks: CopilotMessageBlock[] = [];
  private openText: { nodeId: string; content: string } | null = null;

  snapshot(): CopilotMessageBlock[] {
    return this.openText === null
      ? [...this.blocks]
      : [...this.blocks, { type: 'text', content: this.openText.content }];
  }

  finalize(): CopilotMessageBlock[] {
    this.flushText();
    return [...this.blocks];
  }

  push(ev: PublicExecutionEvent): void {
    switch (ev.type) {
      case 'text':
        this.pushText(ev.text, ev.nodeId);
        break;
      case 'toolCall':
        this.flushText();
        this.blocks.push(makeToolBlock(ev));
        break;
      case 'nodeError':
        this.flushText();
        this.blocks.push({
          type: 'action',
          icon: 'alert-triangle',
          title: 'Step failed',
          description: ev.message,
        });
        break;
      default:
        // node_visited, tokenUsage, structuredOutput, error, done — not represented as blocks
        break;
    }
  }

  private pushText(text: string, nodeId: string): void {
    if (this.openText?.nodeId === nodeId) {
      this.openText.content += text;
      return;
    }
    this.flushText();
    this.openText = { nodeId, content: text };
  }

  private flushText(): void {
    if (this.openText === null) return;
    this.blocks.push({ type: 'text', content: this.openText.content });
    this.openText = null;
  }
}
