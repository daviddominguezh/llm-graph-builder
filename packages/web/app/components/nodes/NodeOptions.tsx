import { memo } from "react";
import { type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RFEdgeData } from "../../utils/graphTransformers";
import type { NodeKind } from "../../utils/nodeKind";
import { NodeOptionRow } from "./NodeOptionRow";
import { useHandleContext } from "./HandleContext";

interface NodeOptionsProps {
  nodeId: string;
  nodeKind: NodeKind;
  options: Edge<RFEdgeData>[];
}

const NodeOptionsComponent = ({ nodeId, nodeKind, options }: NodeOptionsProps) => {
  const t = useTranslations("nodePanel");
  const { onDeleteOption, onAddOption, readOnly } = useHandleContext();

  return (
    <div className="group/options">
      {options.map((edge) => (
        <NodeOptionRow
          key={edge.id}
          edge={edge}
          onDelete={() => onDeleteOption?.(edge.id, edge.source, edge.target)}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          className="flex w-full items-center gap-1 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddOption?.(nodeId, nodeKind, e);
          }}
        >
          <Plus className="h-3 w-3" />
          {t("addOption")}
        </button>
      )}
    </div>
  );
};

export const NodeOptions = memo(NodeOptionsComponent);
