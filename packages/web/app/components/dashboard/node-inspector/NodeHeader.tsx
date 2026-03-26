'use client';

import type { Node as SchemaNode } from '@/app/schemas/graph.schema';

interface NodeHeaderProps {
  node: SchemaNode;
}

export function NodeHeader({ node }: NodeHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold font-mono uppercase">{node.text || node.id}</span>
    </div>
  );
}
