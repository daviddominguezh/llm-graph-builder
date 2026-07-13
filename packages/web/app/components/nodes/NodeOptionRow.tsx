import { memo } from "react";
import { Handle, Position, type Edge } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RFEdgeData } from "../../utils/graphTransformers";
import { getPreconditionDisplayValue } from "../../utils/preconditionHelpers";
import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_RADIUS, HANDLE_WIDTH } from "./HandleContent";
import { useHandleContext } from "./HandleContext";

interface NodeOptionRowProps {
  edge: Edge<RFEdgeData>;
  onDelete: () => void;
}

const rowHandleStyle = {
  width: `${HANDLE_WIDTH}px`,
  height: `${HANDLE_HEIGHT}px`,
  borderRadius: HANDLE_RADIUS,
  border: "none",
  backgroundColor: HANDLE_COLOR,
  right: `-${HANDLE_WIDTH / 2}px`,
  top: "50%",
} as const;

// Kept in the DOM during simulation (so the row's edge stays anchored) but invisible.
const hiddenRowHandleStyle = { ...rowHandleStyle, opacity: 0, pointerEvents: "none" } as const;

const NodeOptionRowComponent = ({ edge, onDelete }: NodeOptionRowProps) => {
  const t = useTranslations("nodePanel");
  const { readOnly, hideHandles } = useHandleContext();
  const first = edge.data?.preconditions?.[0];
  const label = first === undefined ? edge.target : getPreconditionDisplayValue(first);

  return (
    <div className="group relative flex items-center gap-1 border-t border-border/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger className="line-clamp-1! block text-left text-xs text-foreground">
            {label}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {label}
          </TooltipContent>
        </Tooltip>
        <p className="line-clamp-1! text-[10px] text-muted-foreground">{edge.target}</p>
      </div>
      {!readOnly && (
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label={t("deleteOption")}
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 />
        </Button>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id={edge.id}
        style={hideHandles === true ? hiddenRowHandleStyle : rowHandleStyle}
      />
    </div>
  );
};

export const NodeOptionRow = memo(NodeOptionRowComponent);
