'use client';

import { Badge } from '@/components/ui/badge';

import type { Node as SchemaNode } from '@/app/schemas/graph.schema';

interface NodeHeaderProps {
  node: SchemaNode;
}

export function NodeHeader({ node }: NodeHeaderProps) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-sm font-semibold">{node.text || node.id}</span>
      <Badge variant="outline" className="text-[10px]">
        {node.kind}
      </Badge>
    </div>
  );
}
