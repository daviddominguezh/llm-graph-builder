import { memo } from "react";
import { Handle, Position, type Edge } from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RFEdgeData } from "../../utils/graphTransformers";
import { getPreconditionDisplayValue } from "../../utils/preconditionHelpers";
import { useHandleContext } from "./HandleContext";

interface NodeOptionRowProps {
  edge: Edge<RFEdgeData>;
  onDelete: () => void;
}

const rowHandleStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "100px",
  backgroundColor: "var(--background)",
  borderColor: "var(--input)",
  right: "-5px",
  top: "50%",
} as const;

const NodeOptionRowComponent = ({ edge, onDelete }: NodeOptionRowProps) => {
  const t = useTranslations("nodePanel");
  const { readOnly } = useHandleContext();
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
        <button
          type="button"
          aria-label={t("deleteOption")}
          className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <Handle type="source" position={Position.Right} id={edge.id} style={rowHandleStyle} />
    </div>
  );
};

export const NodeOptionRow = memo(NodeOptionRowComponent);
