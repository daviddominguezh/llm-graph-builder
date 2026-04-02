# Node Creation Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chevron dropdown to the ConnectionMenu's "Create new node" button that lets users create structured node patterns (user node, tool node, if/else, loop), each with a configuration dialog featuring mini-graph previews.

**Architecture:** Split-button in ConnectionMenu triggers a DropdownMenu with options. Each option (except Agent) opens a Dialog with a CSS-based mini-graph preview and form fields. Creation logic lives in a dedicated hook (`useStructuredNodeCreation`) separate from `useGraphActions` to respect file size limits. The disable logic reads the source node's existing outgoing edge precondition type.

**Tech Stack:** React, @xyflow/react, shadcn/ui (Dialog, DropdownMenu, Tooltip, Button), next-intl, Tailwind CSS

---

## File Map

### New files (all under `packages/web/app/`)
| File | Responsibility | ~Lines |
|------|---------------|--------|
| `components/panels/NodeTypeDropdown.tsx` | DropdownMenu with 5 options, disable logic, tooltips | ~120 |
| `components/panels/nodeCreationDialogs/UserNodeDialog.tsx` | Dialog: mini-graph + user_said input | ~80 |
| `components/panels/nodeCreationDialogs/ToolNodeDialog.tsx` | Dialog: mini-graph + ToolCombobox | ~90 |
| `components/panels/nodeCreationDialogs/IfElseDialog.tsx` | Dialog: mini-graph + 2 branch inputs | ~100 |
| `components/panels/nodeCreationDialogs/LoopDialog.tsx` | Dialog: mini-graph + type selector + inputs | ~150 |
| `components/panels/nodeCreationDialogs/MiniGraphPreview.tsx` | Reusable CSS node/edge illustration primitives | ~120 |
| `components/panels/nodeCreationDialogs/index.ts` | Barrel export | ~5 |
| `hooks/useStructuredNodeCreation.ts` | Creation handlers for user/tool/if-else/loop patterns | ~200 |
| `utils/edgeTypeUtils.ts` | Helper to determine source node's existing edge type | ~40 |

### Modified files
| File | Changes |
|------|---------|
| `components/panels/ConnectionMenu.tsx` | Split-button, integrate NodeTypeDropdown, dialog state, pass new props |
| `components/GraphBuilder.tsx` | Pass `edges`, `mcpHook.servers`, `mcpHook.discoveredTools` to ConnectionMenu |
| `messages/en.json` | Add `connectionMenu` namespace with all translation keys |
| `hooks/useGraphActions.ts` | Add `edges` to ConnectionMenuState so downstream can compute disable logic |

---

### Task 1: Add translation keys

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add `connectionMenu` namespace to translations**

Add the following after the `"edgePanel"` namespace in `packages/web/messages/en.json`:

```json
"connectionMenu": {
  "connectToExisting": "Connect to existing node:",
  "noNodesAvailable": "No other nodes available to connect to.",
  "searchNodes": "Search nodes...",
  "noNodesFound": "No nodes found.",
  "createNewNode": "Create new node",
  "agentNode": "Agent node",
  "userNode": "User node",
  "toolNode": "Tool node",
  "ifElse": "If / Else",
  "loop": "Loop",
  "disabledIncompatibleEdges": "This node already has {edgeType} edges",
  "disabledStartNode": "Start node only supports user connections",
  "createUserNode": "Create user node",
  "createToolNode": "Create tool node",
  "createIfElse": "Create if / else",
  "createLoop": "Create loop",
  "whenUserSays": "When the user says:",
  "userSaysPlaceholder": "I want to book a flight",
  "toolToCall": "Tool to call:",
  "selectTool": "Select tool...",
  "branchA": "Branch A — when the agent decides:",
  "branchAPlaceholder": "The customer wants to purchase",
  "branchB": "Branch B — when the agent decides:",
  "branchBPlaceholder": "The customer wants to return an item",
  "connectionType": "Connection to loop body:",
  "connectionAgent": "Agent",
  "connectionUser": "User",
  "connectionTool": "Tool",
  "continueLoop": "Continue loop — when the agent decides:",
  "continueLoopPlaceholder": "There are more items to process",
  "exitLoop": "Exit loop — when the agent decides:",
  "exitLoopPlaceholder": "All items have been processed",
  "cancel": "Cancel",
  "create": "Create"
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat(i18n): add connectionMenu translation keys"
```

---

### Task 2: Create edge type utility

**Files:**
- Create: `packages/web/app/utils/edgeTypeUtils.ts`

This utility determines the existing outgoing edge precondition type for a given source node, used by the dropdown's disable logic.

- [ ] **Step 1: Create the utility**

Create `packages/web/app/utils/edgeTypeUtils.ts`:

```typescript
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from './graphTransformers';
import { START_NODE_ID } from './graphInitializer';

export type ExistingEdgeType = 'none' | 'user_said' | 'agent_decision' | 'tool_call' | 'unset';

const EMPTY = 0;

function hasContextPreconditionsOnly(edge: Edge<RFEdgeData>): boolean {
  const hasContext = edge.data?.contextPreconditions !== undefined;
  const preconditions = edge.data?.preconditions;
  const hasNoPreconditions = preconditions === undefined || preconditions.length === EMPTY;
  return hasContext && hasNoPreconditions;
}

function getEdgePreconditionType(edge: Edge<RFEdgeData>): ExistingEdgeType {
  const preconditions = edge.data?.preconditions;
  if (preconditions !== undefined && preconditions.length > EMPTY) {
    return preconditions[EMPTY].type as ExistingEdgeType;
  }
  return 'none';
}

/**
 * Returns the precondition type of existing outgoing edges from a source node.
 * - 'unset' means no outgoing edges (or only context-precondition edges) — all options valid.
 * - 'none' | 'user_said' | 'agent_decision' | 'tool_call' — only compatible options valid.
 */
export function getSourceEdgeType(
  sourceNodeId: string,
  edges: Array<Edge<RFEdgeData>>
): ExistingEdgeType {
  const outgoing = edges
    .filter((e) => e.source === sourceNodeId)
    .filter((e) => !hasContextPreconditionsOnly(e));

  if (outgoing.length === EMPTY) return 'unset';
  return getEdgePreconditionType(outgoing[EMPTY]!);
}

export function isStartNode(nodeId: string): boolean {
  return nodeId === START_NODE_ID;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/utils/edgeTypeUtils.ts
git commit -m "feat: add edge type utility for node creation menu"
```

---

### Task 3: Create MiniGraphPreview component

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/MiniGraphPreview.tsx`

CSS-based node/edge illustration primitives. Uses colored boxes for nodes and SVG lines for edges.

- [ ] **Step 1: Create the component**

Create `packages/web/app/components/panels/nodeCreationDialogs/MiniGraphPreview.tsx`:

```tsx
'use client';

const COLORS = {
  green: { border: 'border-green-500', line: 'stroke-green-500', bg: 'bg-green-500' },
  purple: { border: 'border-purple-500', line: 'stroke-purple-500', bg: 'bg-purple-500' },
  orange: { border: 'border-orange-500', line: 'stroke-orange-500', bg: 'bg-orange-500' },
  muted: { border: 'border-muted-foreground/40', line: 'stroke-muted-foreground/40', bg: 'bg-muted-foreground/40' },
} as const;

type PreviewColor = keyof typeof COLORS;

interface NodeBoxProps {
  label: string;
  dashed?: boolean;
  className?: string;
}

function NodeBox({ label, dashed, className }: NodeBoxProps) {
  return (
    <div
      className={`flex h-9 items-center justify-center rounded-md border bg-background px-3 text-[10px] font-medium text-foreground ${
        dashed ? 'border-dashed border-muted-foreground/50' : 'border-border'
      } ${className ?? ''}`}
    >
      <span className="max-w-[80px] truncate">{label}</span>
    </div>
  );
}

interface ArrowLineProps {
  color: PreviewColor;
  className?: string;
}

function ArrowLine({ color, className }: ArrowLineProps) {
  return (
    <svg
      viewBox="0 0 40 10"
      className={`h-2.5 w-10 shrink-0 ${className ?? ''}`}
    >
      <line x1="0" y1="5" x2="32" y2="5" className={COLORS[color].line} strokeWidth="1.5" />
      <polygon points="32,1 40,5 32,9" className={`fill-current ${COLORS[color].line.replace('stroke-', 'text-')}`} />
    </svg>
  );
}

interface SingleEdgePreviewProps {
  sourceLabel: string;
  color: PreviewColor;
}

export function SingleEdgePreview({ sourceLabel, color }: SingleEdgePreviewProps) {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} />
      <ArrowLine color={color} />
      <NodeBox label="New node" dashed />
    </div>
  );
}

interface IfElsePreviewProps {
  sourceLabel: string;
}

export function IfElsePreview({ sourceLabel }: IfElsePreviewProps) {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2 justify-center">
      <NodeBox label={sourceLabel} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch A" dashed />
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowLine color="purple" />
          <NodeBox label="Branch B" dashed />
        </div>
      </div>
    </div>
  );
}

interface LoopPreviewProps {
  sourceLabel: string;
  connectionColor: PreviewColor;
}

export function LoopPreview({ sourceLabel, connectionColor }: LoopPreviewProps) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 px-2">
      <div className="flex items-center gap-1.5">
        <NodeBox label={sourceLabel} />
        <ArrowLine color={connectionColor} />
        <NodeBox label="Loop Body" dashed />
        <ArrowLine color="purple" />
        <NodeBox label="Exit" dashed />
      </div>
      <svg viewBox="0 0 200 24" className="h-5 w-48 -mt-1">
        <path
          d="M140,2 C160,2 160,22 140,22 L60,22 C40,22 40,2 60,2"
          fill="none"
          className="stroke-purple-500"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
        <polygon points="58,0 66,4 58,8" className="fill-purple-500" transform="translate(0,-2)" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/MiniGraphPreview.tsx
git commit -m "feat: add MiniGraphPreview component for node creation dialogs"
```

---

### Task 4: Create UserNodeDialog

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/UserNodeDialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `packages/web/app/components/panels/nodeCreationDialogs/UserNodeDialog.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SingleEdgePreview } from './MiniGraphPreview';

interface UserNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (userSaidValue: string) => void;
}

export function UserNodeDialog({ open, onOpenChange, sourceNodeLabel, onCreate }: UserNodeDialogProps) {
  const t = useTranslations('connectionMenu');
  const [value, setValue] = useState('');

  const handleCreate = () => {
    onCreate(value.trim());
    setValue('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createUserNode')}</DialogTitle>
        </DialogHeader>
        <SingleEdgePreview sourceLabel={sourceNodeLabel} color="green" />
        <div className="space-y-2 px-1">
          <Label className="text-xs">{t('whenUserSays')}</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('userSaysPlaceholder')}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={value.trim() === ''}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/UserNodeDialog.tsx
git commit -m "feat: add UserNodeDialog component"
```

---

### Task 5: Create ToolNodeDialog

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DiscoveredTool } from '../../../lib/api';
import type { McpServerConfig } from '../../../schemas/graph.schema';
import { ToolCombobox } from '../ToolCombobox';
import { SingleEdgePreview } from './MiniGraphPreview';

interface ToolNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (toolName: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

export function ToolNodeDialog({
  open,
  onOpenChange,
  sourceNodeLabel,
  onCreate,
  servers,
  discoveredTools,
}: ToolNodeDialogProps) {
  const t = useTranslations('connectionMenu');
  const [toolName, setToolName] = useState('');

  const handleCreate = () => {
    onCreate(toolName);
    setToolName('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setToolName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createToolNode')}</DialogTitle>
        </DialogHeader>
        <SingleEdgePreview sourceLabel={sourceNodeLabel} color="orange" />
        <div className="space-y-2 px-1">
          <Label className="text-xs">{t('toolToCall')}</Label>
          <ToolCombobox
            value={toolName}
            onValueChange={setToolName}
            servers={servers}
            discoveredTools={discoveredTools}
            placeholder={t('selectTool')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={toolName === ''}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/ToolNodeDialog.tsx
git commit -m "feat: add ToolNodeDialog component"
```

---

### Task 6: Create IfElseDialog

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/IfElseDialog.tsx`

- [ ] **Step 1: Create the dialog**

Create `packages/web/app/components/panels/nodeCreationDialogs/IfElseDialog.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { IfElsePreview } from './MiniGraphPreview';

interface IfElseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (branchAValue: string, branchBValue: string) => void;
}

export function IfElseDialog({ open, onOpenChange, sourceNodeLabel, onCreate }: IfElseDialogProps) {
  const t = useTranslations('connectionMenu');
  const [branchA, setBranchA] = useState('');
  const [branchB, setBranchB] = useState('');

  const handleCreate = () => {
    onCreate(branchA.trim(), branchB.trim());
    setBranchA('');
    setBranchB('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setBranchA('');
    setBranchB('');
    onOpenChange(false);
  };

  const canCreate = branchA.trim() !== '' && branchB.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createIfElse')}</DialogTitle>
        </DialogHeader>
        <IfElsePreview sourceLabel={sourceNodeLabel} />
        <div className="space-y-4 px-1">
          <div className="space-y-2">
            <Label className="text-xs">{t('branchA')}</Label>
            <Input
              value={branchA}
              onChange={(e) => setBranchA(e.target.value)}
              placeholder={t('branchAPlaceholder')}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('branchB')}</Label>
            <Input
              value={branchB}
              onChange={(e) => setBranchB(e.target.value)}
              placeholder={t('branchBPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/IfElseDialog.tsx
git commit -m "feat: add IfElseDialog component"
```

---

### Task 7: Create LoopDialog

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx`

This is the most complex dialog. It has a connection type selector (Agent/User/Tool) with conditional fields, plus two agent_decision inputs for continue/exit.

- [ ] **Step 1: Create connection type selector sub-component**

Create `packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DiscoveredTool } from '../../../lib/api';
import type { McpServerConfig } from '../../../schemas/graph.schema';
import type { ExistingEdgeType } from '../../../utils/edgeTypeUtils';
import { ToolCombobox } from '../ToolCombobox';
import { LoopPreview } from './MiniGraphPreview';

type LoopConnectionType = 'none' | 'user_said' | 'tool_call';

interface LoopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  sourceEdgeType: ExistingEdgeType;
  onCreate: (connection: { type: LoopConnectionType; value: string }, continueValue: string, exitValue: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

const CONNECTION_COLOR_MAP = {
  none: 'muted',
  user_said: 'green',
  tool_call: 'orange',
} as const;

function isConnectionEnabled(
  connType: LoopConnectionType,
  sourceEdgeType: ExistingEdgeType
): boolean {
  if (sourceEdgeType === 'unset') return true;
  return connType === sourceEdgeType;
}

function ConnectionTypeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:bg-accent'
      } disabled:opacity-40 disabled:pointer-events-none`}
    >
      {label}
    </button>
  );
}

export function LoopDialog({
  open,
  onOpenChange,
  sourceNodeLabel,
  sourceEdgeType,
  onCreate,
  servers,
  discoveredTools,
}: LoopDialogProps) {
  const t = useTranslations('connectionMenu');

  const defaultConnection = resolveDefaultConnection(sourceEdgeType);
  const [connectionType, setConnectionType] = useState<LoopConnectionType>(defaultConnection);
  const [connectionValue, setConnectionValue] = useState('');
  const [continueValue, setContinueValue] = useState('');
  const [exitValue, setExitValue] = useState('');

  const handleCreate = () => {
    const connValue = connectionType === 'none' ? '' : connectionValue;
    onCreate({ type: connectionType, value: connValue.trim() }, continueValue.trim(), exitValue.trim());
    resetForm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setConnectionType(defaultConnection);
    setConnectionValue('');
    setContinueValue('');
    setExitValue('');
  };

  const canCreate = isLoopFormValid(connectionType, connectionValue, continueValue, exitValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createLoop')}</DialogTitle>
        </DialogHeader>
        <LoopPreview sourceLabel={sourceNodeLabel} connectionColor={CONNECTION_COLOR_MAP[connectionType]} />
        <div className="space-y-4 px-1">
          <div className="space-y-2">
            <Label className="text-xs">{t('connectionType')}</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <ConnectionTypeButton
                label={t('connectionAgent')}
                active={connectionType === 'none'}
                disabled={!isConnectionEnabled('none', sourceEdgeType)}
                onClick={() => { setConnectionType('none'); setConnectionValue(''); }}
              />
              <ConnectionTypeButton
                label={t('connectionUser')}
                active={connectionType === 'user_said'}
                disabled={!isConnectionEnabled('user_said', sourceEdgeType)}
                onClick={() => { setConnectionType('user_said'); setConnectionValue(''); }}
              />
              <ConnectionTypeButton
                label={t('connectionTool')}
                active={connectionType === 'tool_call'}
                disabled={!isConnectionEnabled('tool_call', sourceEdgeType)}
                onClick={() => { setConnectionType('tool_call'); setConnectionValue(''); }}
              />
            </div>
          </div>
          <ConnectionValueField
            connectionType={connectionType}
            value={connectionValue}
            onChange={setConnectionValue}
            servers={servers}
            discoveredTools={discoveredTools}
          />
          <div className="space-y-2">
            <Label className="text-xs">{t('continueLoop')}</Label>
            <Input
              value={continueValue}
              onChange={(e) => setContinueValue(e.target.value)}
              placeholder={t('continueLoopPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('exitLoop')}</Label>
            <Input
              value={exitValue}
              onChange={(e) => setExitValue(e.target.value)}
              placeholder={t('exitLoopPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionValueField({
  connectionType,
  value,
  onChange,
  servers,
  discoveredTools,
}: {
  connectionType: LoopConnectionType;
  value: string;
  onChange: (v: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}) {
  const t = useTranslations('connectionMenu');
  if (connectionType === 'none') return null;
  if (connectionType === 'tool_call') {
    return (
      <div className="space-y-2">
        <Label className="text-xs">{t('toolToCall')}</Label>
        <ToolCombobox
          value={value}
          onValueChange={onChange}
          servers={servers}
          discoveredTools={discoveredTools}
          placeholder={t('selectTool')}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{t('whenUserSays')}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('userSaysPlaceholder')}
        className="h-8 text-xs"
      />
    </div>
  );
}

function resolveDefaultConnection(sourceEdgeType: ExistingEdgeType): LoopConnectionType {
  if (sourceEdgeType === 'user_said') return 'user_said';
  if (sourceEdgeType === 'tool_call') return 'tool_call';
  return 'none';
}

function isLoopFormValid(
  connectionType: LoopConnectionType,
  connectionValue: string,
  continueValue: string,
  exitValue: string
): boolean {
  if (continueValue.trim() === '' || exitValue.trim() === '') return false;
  if (connectionType === 'none') return true;
  return connectionValue.trim() !== '';
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/LoopDialog.tsx
git commit -m "feat: add LoopDialog component"
```

---

### Task 8: Create barrel export for dialogs

**Files:**
- Create: `packages/web/app/components/panels/nodeCreationDialogs/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/web/app/components/panels/nodeCreationDialogs/index.ts`:

```typescript
export { UserNodeDialog } from './UserNodeDialog';
export { ToolNodeDialog } from './ToolNodeDialog';
export { IfElseDialog } from './IfElseDialog';
export { LoopDialog } from './LoopDialog';
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/nodeCreationDialogs/index.ts
git commit -m "feat: add barrel export for node creation dialogs"
```

---

### Task 9: Create useStructuredNodeCreation hook

**Files:**
- Create: `packages/web/app/hooks/useStructuredNodeCreation.ts`

This hook contains the creation logic for user node, tool node, if/else, and loop patterns. It's separated from `useGraphActions.ts` to respect the 300-line file limit.

- [ ] **Step 1: Create the hook**

Create `packages/web/app/hooks/useStructuredNodeCreation.ts`:

```typescript
import { type Edge, type Node, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import type { Precondition } from '../schemas/graph.schema';
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_GAP,
} from '../utils/graphInitializer';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { buildInsertEdgeOp, buildInsertNodeOp, buildUpdateNodeOp } from '../utils/operationBuilders';
import type { PushOperation } from '../utils/operationBuilders';

const NANOID_LENGTH = 8;
const HALF = 2;

interface ConnectionMenuState {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string | null;
}

interface StructuredCreationParams {
  nodes: Array<Node<RFNodeData>>;
  setNodes: (nodes: Array<Node<RFNodeData>> | ((nds: Array<Node<RFNodeData>>) => Array<Node<RFNodeData>>)) => void;
  setEdges: (edges: Array<Edge<RFEdgeData>> | ((eds: Array<Edge<RFEdgeData>>) => Array<Edge<RFEdgeData>>)) => void;
  setSelectedNodeId: (id: string | null) => void;
  pushOperation: PushOperation;
  menu: ConnectionMenuState | null;
  closeMenu: () => void;
}

function makeNodeId(): string {
  return `node_${nanoid(NANOID_LENGTH)}`;
}

function makeNode(id: string, position: { x: number; y: number }, text: string): Node<RFNodeData> {
  return {
    id,
    type: 'agent',
    position,
    data: { nodeId: id, text, description: '', nodeWidth: DEFAULT_NODE_WIDTH },
  };
}

function resolveTargetHandle(sourceHandleId: string | null): string {
  if (sourceHandleId === 'top-source') return 'bottom-target';
  if (sourceHandleId === 'bottom-source') return 'top-target';
  return 'left-target';
}

function getBasePosition(sourceNode: Node<RFNodeData>): { x: number; y: number } {
  const srcW = sourceNode.data.nodeWidth ?? DEFAULT_NODE_WIDTH;
  return {
    x: sourceNode.position.x + srcW + NODE_GAP,
    y: sourceNode.position.y,
  };
}

function buildEdgeParams(
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string,
  precondition?: Precondition
): {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string;
  type: string;
  data?: RFEdgeData;
} {
  const data: RFEdgeData | undefined = precondition ? { preconditions: [precondition] } : undefined;
  return { source, target, sourceHandle, targetHandle, type: 'precondition', data };
}

function updateNextNodeIsUser(
  params: StructuredCreationParams,
  sourceNode: Node<RFNodeData>
): void {
  const updated: Node<RFNodeData> = {
    ...sourceNode,
    data: { ...sourceNode.data, nextNodeIsUser: true },
  };
  params.setNodes((nds) => nds.map((n) => (n.id === sourceNode.id ? updated : n)));
  params.pushOperation(buildUpdateNodeOp(updated));
}

export function useCreateUserNode(params: StructuredCreationParams): (userSaidValue: string) => void {
  return useCallback(
    (userSaidValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const id = makeNodeId();
      const position = getBasePosition(sourceNode);
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);
      const precondition: Precondition = { type: 'user_said', value: userSaidValue };
      const newNode = makeNode(id, position, '');

      params.setNodes((nds) => [...nds, newNode]);
      params.setEdges((eds) =>
        addEdge(buildEdgeParams(params.menu!.sourceNodeId, id, params.menu!.sourceHandleId, targetHandle, precondition), eds)
      );
      params.pushOperation(buildInsertNodeOp(newNode));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, id, { preconditions: [precondition] }));
      updateNextNodeIsUser(params, sourceNode);
      params.setSelectedNodeId(id);
      params.closeMenu();
    },
    [params]
  );
}

export function useCreateToolNode(params: StructuredCreationParams): (toolName: string) => void {
  return useCallback(
    (toolName: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const id = makeNodeId();
      const position = getBasePosition(sourceNode);
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);
      const precondition: Precondition = { type: 'tool_call', value: toolName };
      const newNode = makeNode(id, position, '');

      params.setNodes((nds) => [...nds, newNode]);
      params.setEdges((eds) =>
        addEdge(buildEdgeParams(params.menu!.sourceNodeId, id, params.menu!.sourceHandleId, targetHandle, precondition), eds)
      );
      params.pushOperation(buildInsertNodeOp(newNode));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, id, { preconditions: [precondition] }));
      params.setSelectedNodeId(id);
      params.closeMenu();
    },
    [params]
  );
}

export function useCreateIfElse(
  params: StructuredCreationParams
): (branchAValue: string, branchBValue: string) => void {
  return useCallback(
    (branchAValue: string, branchBValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const idA = makeNodeId();
      const idB = makeNodeId();
      const base = getBasePosition(sourceNode);
      const verticalOffset = (DEFAULT_NODE_HEIGHT + NODE_GAP) / HALF;
      const posA = { x: base.x, y: base.y - verticalOffset };
      const posB = { x: base.x, y: base.y + verticalOffset };
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);

      const preconditionA: Precondition = { type: 'agent_decision', value: branchAValue };
      const preconditionB: Precondition = { type: 'agent_decision', value: branchBValue };
      const nodeA = makeNode(idA, posA, 'Branch A');
      const nodeB = makeNode(idB, posB, 'Branch B');

      params.setNodes((nds) => [...nds, nodeA, nodeB]);
      params.setEdges((eds) => {
        let next = addEdge(
          buildEdgeParams(params.menu!.sourceNodeId, idA, params.menu!.sourceHandleId, targetHandle, preconditionA),
          eds
        );
        next = addEdge(
          buildEdgeParams(params.menu!.sourceNodeId, idB, params.menu!.sourceHandleId, targetHandle, preconditionB),
          next
        );
        return next;
      });
      params.pushOperation(buildInsertNodeOp(nodeA));
      params.pushOperation(buildInsertNodeOp(nodeB));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, idA, { preconditions: [preconditionA] }));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, idB, { preconditions: [preconditionB] }));
      params.setSelectedNodeId(idA);
      params.closeMenu();
    },
    [params]
  );
}

interface LoopConnection {
  type: 'none' | 'user_said' | 'tool_call';
  value: string;
}

export function useCreateLoop(
  params: StructuredCreationParams
): (connection: LoopConnection, continueValue: string, exitValue: string) => void {
  return useCallback(
    (connection: LoopConnection, continueValue: string, exitValue: string) => {
      if (params.menu === null) return;
      const sourceNode = params.nodes.find((n) => n.id === params.menu!.sourceNodeId);
      if (sourceNode === undefined) return;

      const loopId = makeNodeId();
      const exitId = makeNodeId();
      const base = getBasePosition(sourceNode);
      const exitPos = { x: base.x + DEFAULT_NODE_WIDTH + NODE_GAP, y: base.y };
      const targetHandle = resolveTargetHandle(params.menu.sourceHandleId);

      const loopNode = makeNode(loopId, base, 'Loop Body');
      const exitNode = makeNode(exitId, exitPos, 'Exit');

      // Edge: source -> loop body
      const connPrecondition: Precondition | undefined =
        connection.type === 'none' ? undefined : { type: connection.type, value: connection.value };
      const connEdgeData: RFEdgeData | undefined = connPrecondition ? { preconditions: [connPrecondition] } : undefined;

      // Edge: loop body -> source (back-edge)
      const continuePrecondition: Precondition = { type: 'agent_decision', value: continueValue };
      // Edge: loop body -> exit
      const exitPrecondition: Precondition = { type: 'agent_decision', value: exitValue };

      params.setNodes((nds) => [...nds, loopNode, exitNode]);
      params.setEdges((eds) => {
        let next = addEdge(
          buildEdgeParams(params.menu!.sourceNodeId, loopId, params.menu!.sourceHandleId, targetHandle, connPrecondition),
          eds
        );
        next = addEdge(
          buildEdgeParams(loopId, params.menu!.sourceNodeId, 'right-source', 'left-target', continuePrecondition),
          next
        );
        next = addEdge(
          buildEdgeParams(loopId, exitId, 'bottom-source', 'top-target', exitPrecondition),
          next
        );
        return next;
      });

      params.pushOperation(buildInsertNodeOp(loopNode));
      params.pushOperation(buildInsertNodeOp(exitNode));
      params.pushOperation(buildInsertEdgeOp(params.menu!.sourceNodeId, loopId, connEdgeData));
      params.pushOperation(buildInsertEdgeOp(loopId, params.menu!.sourceNodeId, { preconditions: [continuePrecondition] }));
      params.pushOperation(buildInsertEdgeOp(loopId, exitId, { preconditions: [exitPrecondition] }));

      if (connection.type === 'user_said') {
        updateNextNodeIsUser(params, sourceNode);
      }
      params.setSelectedNodeId(loopId);
      params.closeMenu();
    },
    [params]
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/hooks/useStructuredNodeCreation.ts
git commit -m "feat: add useStructuredNodeCreation hook with user/tool/if-else/loop handlers"
```

---

### Task 10: Create NodeTypeDropdown component

**Files:**
- Create: `packages/web/app/components/panels/NodeTypeDropdown.tsx`

The dropdown menu with 5 options (Agent, User, Tool, If/Else, Loop), disable logic, and tooltips.

- [ ] **Step 1: Create the component**

Create `packages/web/app/components/panels/NodeTypeDropdown.tsx`:

```tsx
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Brain, GitFork, MessageSquare, Repeat, Send, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ExistingEdgeType } from '../../utils/edgeTypeUtils';

type NodeCreationType = 'agent' | 'user' | 'tool' | 'ifElse' | 'loop';

interface NodeTypeDropdownProps {
  sourceEdgeType: ExistingEdgeType;
  isStartNode: boolean;
  onSelect: (type: NodeCreationType) => void;
  children: React.ReactNode;
}

interface OptionConfig {
  type: NodeCreationType;
  labelKey: string;
  icon: React.ReactNode;
  colorClass: string;
}

const OPTIONS: OptionConfig[] = [
  { type: 'agent', labelKey: 'agentNode', icon: <Send className="h-3.5 w-3.5" />, colorClass: 'text-muted-foreground' },
  { type: 'user', labelKey: 'userNode', icon: <MessageSquare className="h-3.5 w-3.5" />, colorClass: 'text-green-600' },
  { type: 'tool', labelKey: 'toolNode', icon: <Wrench className="h-3.5 w-3.5" />, colorClass: 'text-orange-600' },
  { type: 'ifElse', labelKey: 'ifElse', icon: <GitFork className="h-3.5 w-3.5" />, colorClass: 'text-purple-600' },
  { type: 'loop', labelKey: 'loop', icon: <Repeat className="h-3.5 w-3.5" />, colorClass: 'text-purple-600' },
];

const EDGE_TYPE_MAP: Record<NodeCreationType, ExistingEdgeType | 'special'> = {
  agent: 'none',
  user: 'user_said',
  tool: 'tool_call',
  ifElse: 'agent_decision',
  loop: 'special',
};

function isOptionEnabled(
  optionType: NodeCreationType,
  sourceEdgeType: ExistingEdgeType,
  startNode: boolean
): boolean {
  if (startNode) return optionType === 'user';
  if (sourceEdgeType === 'unset') return true;
  if (optionType === 'loop') return true; // Loop handles compatibility in its dialog
  return EDGE_TYPE_MAP[optionType] === sourceEdgeType;
}

function getDisabledReason(
  optionType: NodeCreationType,
  sourceEdgeType: ExistingEdgeType,
  startNode: boolean,
  t: (key: string, values?: Record<string, string>) => string
): string | null {
  if (isOptionEnabled(optionType, sourceEdgeType, startNode)) return null;
  if (startNode) return t('disabledStartNode');
  return t('disabledIncompatibleEdges', { edgeType: sourceEdgeType });
}

function DropdownOption({
  config,
  disabled,
  disabledReason,
  onSelect,
  label,
}: {
  config: OptionConfig;
  disabled: boolean;
  disabledReason: string | null;
  onSelect: () => void;
  label: string;
}) {
  const item = (
    <DropdownMenuItem disabled={disabled} onClick={onSelect}>
      <span className={config.colorClass}>{config.icon}</span>
      {label}
    </DropdownMenuItem>
  );

  if (disabledReason === null) return item;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        {item}
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}

export function NodeTypeDropdown({ sourceEdgeType, isStartNode: startNode, onSelect, children }: NodeTypeDropdownProps) {
  const t = useTranslations('connectionMenu');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {OPTIONS.map((config) => {
          const disabled = !isOptionEnabled(config.type, sourceEdgeType, startNode);
          const reason = getDisabledReason(config.type, sourceEdgeType, startNode, t);
          return (
            <DropdownOption
              key={config.type}
              config={config}
              disabled={disabled}
              disabledReason={reason}
              onSelect={() => onSelect(config.type)}
              label={t(config.labelKey)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { NodeCreationType };
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/NodeTypeDropdown.tsx
git commit -m "feat: add NodeTypeDropdown with disable logic and tooltips"
```

---

### Task 11: Update ConnectionMenu with split button and dialog integration

**Files:**
- Modify: `packages/web/app/components/panels/ConnectionMenu.tsx`

This is the main integration point. The "Create new node" button becomes a split button with a chevron that opens the NodeTypeDropdown. Selecting an option opens the corresponding dialog.

- [ ] **Step 1: Rewrite ConnectionMenu**

Replace the entire content of `packages/web/app/components/panels/ConnectionMenu.tsx` with:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxCollection,
} from '@/components/ui/combobox';
import { ChevronDown, Info, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';
import type { ExistingEdgeType } from '../../utils/edgeTypeUtils';
import { IfElseDialog, LoopDialog, ToolNodeDialog, UserNodeDialog } from './nodeCreationDialogs';
import { NodeTypeDropdown, type NodeCreationType } from './NodeTypeDropdown';

const START_NODE_ID = 'INITIAL_STEP';

type ActiveDialog = 'user' | 'tool' | 'ifElse' | 'loop' | null;

interface ConnectionMenuProps {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string | null;
  sourceEdgeType: ExistingEdgeType;
  nodes: Array<{ id: string; text: string }>;
  onSelectNode: (targetNodeId: string) => void;
  onCreateNode: () => void;
  onCreateUserNode: (value: string) => void;
  onCreateToolNode: (toolName: string) => void;
  onCreateIfElse: (branchA: string, branchB: string) => void;
  onCreateLoop: (connection: { type: 'none' | 'user_said' | 'tool_call'; value: string }, continueValue: string, exitValue: string) => void;
  onClose: () => void;
  mcpServers: McpServerConfig[];
  mcpDiscoveredTools: Record<string, DiscoveredTool[]>;
}

export function ConnectionMenu({
  position,
  sourceNodeId,
  sourceEdgeType,
  nodes,
  onSelectNode,
  onCreateNode,
  onCreateUserNode,
  onCreateToolNode,
  onCreateIfElse,
  onCreateLoop,
  onClose,
  mcpServers,
  mcpDiscoveredTools,
}: ConnectionMenuProps) {
  const t = useTranslations('connectionMenu');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const availableNodes = nodes.filter(
    (n) => n.id !== sourceNodeId && n.id !== START_NODE_ID
  );

  const handleNodeSelect = (value: string | null) => {
    if (value) onSelectNode(value);
  };

  const handleTypeSelect = (type: NodeCreationType) => {
    if (type === 'agent') {
      onCreateNode();
      return;
    }
    setActiveDialog(type);
  };

  const sourceLabel = nodes.find((n) => n.id === sourceNodeId)?.text || sourceNodeId;
  const isStart = sourceNodeId === START_NODE_ID;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 w-64 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95"
        style={{ left: position.x, top: position.y }}
      >
        <p className="text-xs text-muted-foreground p-3 px-3 pb-1">
          {t('connectToExisting')}
        </p>

        {availableNodes.length === 0 && (
          <div className="p-2 pt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t('noNodesAvailable')}</AlertDescription>
            </Alert>
          </div>
        )}

        {availableNodes.length > 0 && (
          <div className="p-2 pt-0">
            <Combobox items={availableNodes} onValueChange={handleNodeSelect}>
              <ComboboxInput placeholder={t('searchNodes')} className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>{t('noNodesFound')}</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(node) => (
                      <ComboboxItem key={node.id} value={node.id}>
                        {node.id}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        )}

        <Separator />

        <div className="p-2 py-3">
          <div className="flex">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2 rounded-r-none border-r-0"
              onClick={onCreateNode}
            >
              <Plus className="h-4 w-4" />
              {t('createNewNode')}
            </Button>
            <NodeTypeDropdown
              sourceEdgeType={sourceEdgeType}
              isStartNode={isStart}
              onSelect={handleTypeSelect}
            >
              <Button
                variant="outline"
                size="sm"
                className="rounded-l-none px-1.5"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </NodeTypeDropdown>
          </div>
        </div>
      </div>

      <UserNodeDialog
        open={activeDialog === 'user'}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateUserNode}
      />
      <ToolNodeDialog
        open={activeDialog === 'tool'}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateToolNode}
        servers={mcpServers}
        discoveredTools={mcpDiscoveredTools}
      />
      <IfElseDialog
        open={activeDialog === 'ifElse'}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateIfElse}
      />
      <LoopDialog
        open={activeDialog === 'loop'}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        sourceNodeLabel={sourceLabel}
        sourceEdgeType={sourceEdgeType}
        onCreate={onCreateLoop}
        servers={mcpServers}
        discoveredTools={mcpDiscoveredTools}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/app/components/panels/ConnectionMenu.tsx
git commit -m "feat: update ConnectionMenu with split button and dialog integration"
```

---

### Task 12: Update useGraphActions to expose edges in menu state

**Files:**
- Modify: `packages/web/app/hooks/useGraphActions.ts`

The ConnectionMenu now needs the source node's existing edge type. We add `edges` to the hook params that get passed through, so `GraphBuilder` can compute `sourceEdgeType` when rendering.

No structural changes needed to `useGraphActions.ts` itself — the edge type computation happens in `GraphBuilder.tsx` using `getSourceEdgeType()`. The hook already exposes `connectionMenu.sourceNodeId` which is sufficient.

This task has no code changes — it's a no-op. The edge type is computed in GraphBuilder at render time.

- [ ] **Step 1: Verify no changes needed**

Confirm that `useGraphActions.ts` already exposes `connectionMenu` with `sourceNodeId`, which is all that's needed. The `getSourceEdgeType` utility is called in GraphBuilder.

---

### Task 13: Wire everything together in GraphBuilder

**Files:**
- Modify: `packages/web/app/components/GraphBuilder.tsx`

Pass MCP servers, discovered tools, edges, and structured creation handlers to ConnectionMenu.

- [ ] **Step 1: Add imports to GraphBuilder.tsx**

Add the following imports at the top of `packages/web/app/components/GraphBuilder.tsx`:

```typescript
import { getSourceEdgeType, isStartNode } from '../utils/edgeTypeUtils';
import {
  useCreateUserNode,
  useCreateToolNode,
  useCreateIfElse,
  useCreateLoop,
} from '../hooks/useStructuredNodeCreation';
```

- [ ] **Step 2: Add structured creation hooks in useGraphBuilderHooks**

In the `useGraphBuilderHooks` function, after the `graphActions` declaration (around line 312), add:

```typescript
const structuredCreationParams = useMemo(
  () => ({
    nodes,
    setNodes,
    setEdges,
    setSelectedNodeId: selection.setSelectedNodeId,
    pushOperation: opQueue.pushOperation,
    menu: graphActions.connectionMenu,
    closeMenu: graphActions.handleConnectionMenuClose,
  }),
  [nodes, setNodes, setEdges, selection.setSelectedNodeId, opQueue.pushOperation, graphActions.connectionMenu, graphActions.handleConnectionMenuClose]
);

const createUserNode = useCreateUserNode(structuredCreationParams);
const createToolNode = useCreateToolNode(structuredCreationParams);
const createIfElse = useCreateIfElse(structuredCreationParams);
const createLoop = useCreateLoop(structuredCreationParams);
```

Add these to the return object:

```typescript
createUserNode,
createToolNode,
createIfElse,
createLoop,
```

- [ ] **Step 3: Update ConnectionMenu rendering in LoadedEditor**

Replace the existing ConnectionMenu block (lines 544-554) with:

```tsx
{!isReadOnly && h.agentConfig === undefined && h.graphActions.connectionMenu !== null && (
  <ConnectionMenu
    position={h.graphActions.connectionMenu.position}
    sourceNodeId={h.graphActions.connectionMenu.sourceNodeId}
    sourceHandleId={h.graphActions.connectionMenu.sourceHandleId}
    sourceEdgeType={getSourceEdgeType(h.graphActions.connectionMenu.sourceNodeId, h.edges)}
    nodes={h.nodes.map((n) => ({ id: n.id, text: (n.data as RFNodeData).text }))}
    onSelectNode={h.graphActions.handleConnectionMenuSelectNode}
    onCreateNode={h.graphActions.handleConnectionMenuCreateNode}
    onCreateUserNode={h.createUserNode}
    onCreateToolNode={h.createToolNode}
    onCreateIfElse={h.createIfElse}
    onCreateLoop={h.createLoop}
    onClose={h.graphActions.handleConnectionMenuClose}
    mcpServers={h.mcpHook.servers}
    mcpDiscoveredTools={h.mcpHook.discoveredTools}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/GraphBuilder.tsx
git commit -m "feat: wire structured node creation into GraphBuilder"
```

---

### Task 14: Run checks and fix issues

**Files:**
- All new and modified files

- [ ] **Step 1: Run full check**

```bash
npm run check
```

Expected: Format, lint, and typecheck should pass. Fix any issues that arise.

- [ ] **Step 2: Start dev server and manually test**

```bash
npm run dev -w packages/web
```

Test in browser at `http://localhost:3101`:
1. Click a node handle — ConnectionMenu appears with split button
2. Click main button — creates plain agent node (unchanged behavior)
3. Click chevron — dropdown appears with 5 options
4. Verify disable logic: add an edge with `user_said` precondition, then check that only "User node" and "Loop" are enabled
5. Test each dialog: User, Tool, If/Else, Loop
6. Verify nodes and edges are created correctly
7. Verify auto-save triggers (check network tab for save requests)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address check issues in node creation menu"
```
