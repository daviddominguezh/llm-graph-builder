'use client';

import { useHotkeys } from 'react-hotkeys-hook';

import type { Dispatch } from '../editor-actions/actionRegistry';
import type { ShortcutContext, ShortcutDef } from './shortcuts';
import { EDITOR_SHORTCUTS } from './shortcuts';

/** Form elements a hotkey stays live inside when its row opts in. */
const FORM_TAG_ELEMENTS = ['input', 'textarea', 'select'] as const;

interface EditorHotkeysProps {
  dispatch: Dispatch;
  /** isActiveEditor && !readOnly && !agentMode — hidden cached editors must not respond. */
  active: boolean;
  ctx: ShortcutContext;
}

interface ShortcutBindingProps extends EditorHotkeysProps {
  def: ShortcutDef;
}

/**
 * One `useHotkeys` call per table row — a dedicated component keeps the hook out
 * of a loop so the rules-of-hooks invariant holds as EDITOR_SHORTCUTS grows.
 */
function ShortcutBinding({ def, dispatch, active, ctx }: ShortcutBindingProps) {
  const enabled = active && (def.enabled?.(ctx) ?? true);
  const enableInForms = def.enableOnFormTags === true;

  useHotkeys(
    def.keys,
    () => {
      dispatch(def.actionId, undefined);
    },
    {
      enabled,
      preventDefault: true,
      enableOnFormTags: enableInForms ? FORM_TAG_ELEMENTS : false,
      enableOnContentEditable: enableInForms,
    },
    [dispatch, enabled]
  );

  return null;
}

/** Mounts one hotkey binding per EDITOR_SHORTCUTS row. Renders nothing. */
export function EditorHotkeys(props: EditorHotkeysProps) {
  return (
    <>
      {EDITOR_SHORTCUTS.map((def) => (
        <ShortcutBinding key={def.id} def={def} {...props} />
      ))}
    </>
  );
}
