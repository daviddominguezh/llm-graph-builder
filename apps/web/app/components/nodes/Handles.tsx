import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  BottomSourceContent,
  BottomTargetContent,
  HANDLE_SIZE,
  LeftSourceContent,
  LeftTargetContent,
  RightSourceContent,
  RightTargetContent,
  TopSourceContent,
  TopTargetContent,
} from "./HandleContent";

// Pre-rendered static handle style objects - never recreate
const handleStyleBase = {
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`,
  borderWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

const topTargetStyle = {
  ...handleStyleBase,
  backgroundColor: "var(--xy-background-color)",
  left: "35%",
} as const;
const topSourceStyle = {
  ...handleStyleBase,
  backgroundColor: "white",
  left: "65%",
} as const;
const bottomTargetStyle = {
  ...handleStyleBase,
  backgroundColor: "var(--xy-background-color)",
  left: "35%",
} as const;
const bottomSourceStyle = {
  ...handleStyleBase,
  backgroundColor: "white",
  left: "65%",
} as const;
const leftTargetStyle = {
  ...handleStyleBase,
  backgroundColor: "var(--xy-background-color)",
  top: "35%",
} as const;
const leftSourceStyle = {
  ...handleStyleBase,
  backgroundColor: "white",
  top: "65%",
} as const;
const rightTargetStyle = {
  ...handleStyleBase,
  backgroundColor: "var(--xy-background-color)",
  top: "35%",
} as const;
const rightSourceStyle = {
  ...handleStyleBase,
  backgroundColor: "white",
  top: "65%",
} as const;

const HandlesComponent = () => {
  return (
    <>
      {/* Top handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        style={topTargetStyle}
      >
        {TopTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        style={topSourceStyle}
      >
        {TopSourceContent}
      </Handle>

      {/* Bottom handles */}
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        style={bottomTargetStyle}
      >
        {BottomTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        style={bottomSourceStyle}
      >
        {BottomSourceContent}
      </Handle>

      {/* Left handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={leftTargetStyle}
      >
        {LeftTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        style={leftSourceStyle}
      >
        {LeftSourceContent}
      </Handle>

      {/* Right handles */}
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={rightTargetStyle}
      >
        {RightTargetContent}
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={rightSourceStyle}
      >
        {RightSourceContent}
      </Handle>
    </>
  );
};

// Never re-render - no props
export const Handles = memo(HandlesComponent, () => true);
