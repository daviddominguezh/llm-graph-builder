"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowRight } from "lucide-react";
import { HANDLE_SIZE, ICON_SIZE } from "./HandleContent";
import { useHandleContext } from "./HandleContext";

const GREEN_BORDER = "#22c55e";

const rightSourceStyle = {
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`,
  borderWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backgroundColor: "white",
  top: "50%",
} as const;

const RightSourceContentGreen = (
  <div className="relative w-full h-full flex flex-col justify-center items-center">
    <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: "rotate(0deg)" }} />
    <div className="absolute right-[0px]">
      <svg width={HANDLE_SIZE + 2} height={HANDLE_SIZE + 2} viewBox="0 -1.5 0.05 19">
        <path d="M 0 -1 A 9 9 0 0 1 0 17 L 8 17 L 8 -1 Z" fill="var(--xy-background-color)" />
        <path d="M 0 -1 A 9 9 0 0 1 0 17" fill="none" stroke={GREEN_BORDER} strokeWidth="1" />
      </svg>
    </div>
  </div>
);

function StartNodeComponent({ selected, id }: NodeProps) {
  const { onSourceHandleClick } = useHandleContext();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(id, "right-source", e);
  };

  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-green-500 px-6 py-3 ${
        selected ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-white">
        Start
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        onClick={handleClick}
        onMouseDown={preventDrag}
        style={rightSourceStyle}
      >
        {RightSourceContentGreen}
      </Handle>
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
