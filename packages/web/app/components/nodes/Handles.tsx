import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  BottomSourceContent,
  BottomSourceContentRed,
  BottomTargetContent,
  BottomTargetContentRed,
  HANDLE_SIZE,
  LeftTargetContent,
  LeftTargetContentRed,
  RightSourceContent,
  RightSourceContentRed,
  TopSourceContent,
  TopSourceContentRed,
  TopTargetContent,
  TopTargetContentRed,
} from "./HandleContent";
import { useHandleContext } from "./HandleContext";

// Pre-rendered static handle style objects - never recreate
const handleStyleBase = {
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  borderRadius: '100px',
  overflow: 'hidden'
} as const;

const readOnlyStyleBase = {
  ...handleStyleBase,
  cursor: "default",
  pointerEvents: "none",
} as const;

function buildHandleStyles(base: typeof handleStyleBase | typeof readOnlyStyleBase) {
  return {
    topTarget: { ...base, backgroundColor: "var(--xy-background-color)", left: "35%" } as const,
    topSource: { ...base, backgroundColor: "var(--background)", left: "65%" } as const,
    bottomTarget: { ...base, backgroundColor: "var(--xy-background-color)", left: "35%" } as const,
    bottomSource: { ...base, backgroundColor: "var(--background)", left: "65%" } as const,
    leftTarget: { ...base, backgroundColor: "var(--xy-background-color)", top: "50%" } as const,
    rightSource: { ...base, backgroundColor: "var(--background)", top: "50%" } as const,
  };
}

const editableStyles = buildHandleStyles(handleStyleBase);
const readOnlyStyles = buildHandleStyles(readOnlyStyleBase);

interface HandlesProps {
  nodeId: string;
  nextNodeIsUser?: boolean;
}

function HandlesComponent({ nodeId, nextNodeIsUser }: HandlesProps) {
  const { onSourceHandleClick, readOnly } = useHandleContext();
  const s = readOnly ? readOnlyStyles : editableStyles;

  const handleSourceClick = (handleId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(nodeId, handleId, e);
  };

  // Prevent drag-and-drop connection - only allow click
  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      {/* Top handles */}
      <Handle type="target" position={Position.Top} id="top-target" style={s.topTarget}>
        {nextNodeIsUser ? TopTargetContentRed : TopTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        style={s.topSource}
        onClick={readOnly ? undefined : handleSourceClick("top-source")}
        onMouseDown={readOnly ? undefined : preventDrag}
      >
        {nextNodeIsUser ? TopSourceContentRed : TopSourceContent}
      </Handle>

      {/* Bottom handles */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={s.bottomTarget}>
        {nextNodeIsUser ? BottomTargetContentRed : BottomTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        style={s.bottomSource}
        onClick={readOnly ? undefined : handleSourceClick("bottom-source")}
        onMouseDown={readOnly ? undefined : preventDrag}
      >
        {nextNodeIsUser ? BottomSourceContentRed : BottomSourceContent}
      </Handle>

      {/* Left handles */}
      <Handle type="target" position={Position.Left} id="left-target" style={s.leftTarget}>
        {nextNodeIsUser ? LeftTargetContentRed : LeftTargetContent}
      </Handle>

      {/* Right handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={s.rightSource}
        onClick={readOnly ? undefined : handleSourceClick("right-source")}
        onMouseDown={readOnly ? undefined : preventDrag}
      >
        {nextNodeIsUser ? RightSourceContentRed : RightSourceContent}
      </Handle>
    </>
  );
}

export const Handles = memo(HandlesComponent);
