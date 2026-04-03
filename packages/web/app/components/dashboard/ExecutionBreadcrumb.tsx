'use client';

import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  executionId: string;
  label: string;
}

interface ExecutionBreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (executionId: string) => void;
}

export function ExecutionBreadcrumb({ items, onNavigate }: ExecutionBreadcrumbProps) {
  if (items.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground px-3 py-1.5">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.executionId} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" />}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(item.executionId)}
                className="hover:text-foreground transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
