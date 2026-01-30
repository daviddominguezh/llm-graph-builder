import { memo } from "react";

interface NodeBodyProps {
  nodeId: string;
  description?: string;
}

const NodeBodyComponent = ({ nodeId, description }: NodeBodyProps) => {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-foreground">{nodeId}</p>
      {description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
};

export const NodeBody = memo(NodeBodyComponent, (prev, next) =>
  prev.nodeId === next.nodeId && prev.description === next.description
);
