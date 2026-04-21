'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type QuillType from 'quill';
import { Fragment, useEffect, useState } from 'react';

type Action =
  | { kind: 'toggle'; format: 'bold' | 'italic' | 'strike' | 'blockquote' | 'code-block' }
  | { kind: 'header'; level: 1 | 2 | 3 }
  | { kind: 'list'; variant: 'ordered' | 'bullet' }
  | { kind: 'link' };

type LabelKey =
  | 'toolbarBold'
  | 'toolbarItalic'
  | 'toolbarStrike'
  | 'toolbarH1'
  | 'toolbarH2'
  | 'toolbarH3'
  | 'toolbarBulletList'
  | 'toolbarOrderedList'
  | 'toolbarQuote'
  | 'toolbarCodeBlock'
  | 'toolbarLink';

interface Item {
  icon: LucideIcon;
  action: Action;
  labelKey: LabelKey;
  divider?: boolean;
}

const ITEMS: readonly Item[] = [
  { icon: Bold, action: { kind: 'toggle', format: 'bold' }, labelKey: 'toolbarBold' },
  { icon: Italic, action: { kind: 'toggle', format: 'italic' }, labelKey: 'toolbarItalic' },
  { icon: Strikethrough, action: { kind: 'toggle', format: 'strike' }, labelKey: 'toolbarStrike', divider: true },
  { icon: Heading1, action: { kind: 'header', level: 1 }, labelKey: 'toolbarH1' },
  { icon: Heading2, action: { kind: 'header', level: 2 }, labelKey: 'toolbarH2' },
  { icon: Heading3, action: { kind: 'header', level: 3 }, labelKey: 'toolbarH3', divider: true },
  { icon: List, action: { kind: 'list', variant: 'bullet' }, labelKey: 'toolbarBulletList' },
  {
    icon: ListOrdered,
    action: { kind: 'list', variant: 'ordered' },
    labelKey: 'toolbarOrderedList',
    divider: true,
  },
  { icon: Quote, action: { kind: 'toggle', format: 'blockquote' }, labelKey: 'toolbarQuote' },
  { icon: Code2, action: { kind: 'toggle', format: 'code-block' }, labelKey: 'toolbarCodeBlock' },
  { icon: LinkIcon, action: { kind: 'link' }, labelKey: 'toolbarLink' },
];

function isActionActive(action: Action, fmt: Record<string, unknown>): boolean {
  if (action.kind === 'toggle') return Boolean(fmt[action.format]);
  if (action.kind === 'header') return fmt.header === action.level;
  if (action.kind === 'list') return fmt.list === action.variant;
  return false;
}

function toggleHeader(quill: QuillType, fmt: Record<string, unknown>, level: 1 | 2 | 3): void {
  quill.format('header', fmt.header === level ? false : level);
}

function toggleList(quill: QuillType, fmt: Record<string, unknown>, variant: 'ordered' | 'bullet'): void {
  quill.format('list', fmt.list === variant ? false : variant);
}

function promptForLink(quill: QuillType): void {
  const url = window.prompt('URL');
  if (url !== null && url !== '') quill.format('link', url);
}

function applyAction(quill: QuillType, action: Action): void {
  const fmt = quill.getFormat() as Record<string, unknown>;
  if (action.kind === 'toggle') {
    quill.format(action.format, !fmt[action.format]);
    return;
  }
  if (action.kind === 'header') return toggleHeader(quill, fmt, action.level);
  if (action.kind === 'list') return toggleList(quill, fmt, action.variant);
  promptForLink(quill);
}

type QuillRange = { index: number; length: number } | null;

function useActiveFormat(quill: QuillType | null): Record<string, unknown> {
  const [fmt, setFmt] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!quill) return;
    const apply = (range: QuillRange) => {
      if (range === null) {
        setFmt({});
        return;
      }
      setFmt(quill.getFormat(range) as Record<string, unknown>);
    };
    const onSelectionChange = (range: QuillRange) => apply(range);
    const onTextChange = () => apply(quill.getSelection() as QuillRange);
    quill.on('selection-change', onSelectionChange);
    quill.on('text-change', onTextChange);
    return () => {
      quill.off('selection-change', onSelectionChange);
      quill.off('text-change', onTextChange);
    };
  }, [quill]);
  return fmt;
}

interface ButtonProps {
  icon: LucideIcon;
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function ToolbarIconButton({ icon: Icon, active, disabled, label, onClick }: ButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={`rounded ${active ? 'bg-input text-foreground' : 'text-muted-foreground'}`}
        >
          <Icon strokeWidth={2} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  quill: QuillType | null;
}

export function SystemPromptToolbar({ quill }: Props) {
  const t = useTranslations('agentEditor');
  const fmt = useActiveFormat(quill);
  return (
    <div className="flex items-center gap-0.5 self-start rounded-md px-1 py-0.5">
      {ITEMS.map((item, i) => (
        <Fragment key={i}>
          <ToolbarIconButton
            icon={item.icon}
            active={isActionActive(item.action, fmt)}
            disabled={!quill}
            label={t(item.labelKey)}
            onClick={() => quill && applyAction(quill, item.action)}
          />
          {item.divider === true && <div className="mx-0.5 h-4 w-px bg-border" />}
        </Fragment>
      ))}
    </div>
  );
}
