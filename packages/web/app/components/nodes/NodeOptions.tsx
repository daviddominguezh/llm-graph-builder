import { memo } from "react";
import { type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
        <div className="border-t border-border/60 p-1">
          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onAddOption?.(nodeId, nodeKind, e);
            }}
          >
            <Plus />
            {t("addOption")}
          </Button>
        </div>
      )}
    </div>
  );
};

export const NodeOptions = memo(NodeOptionsComponent);
