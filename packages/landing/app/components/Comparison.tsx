import { Check, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CellValue, ComparisonRow } from './comparison-data';
import { COMPETITOR_KEYS, COMPETITORS, ROWS } from './comparison-data';

function CellDisplay({ value, highlight }: { value: CellValue; highlight: boolean }): ReactNode {
  switch (value) {
    case 'yes':
      return <Check className={`mx-auto h-4 w-4 ${highlight ? 'text-primary' : 'text-foreground'}`} />;
    case 'no':
      return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
    case 'partial':
      return <span className="text-xs text-amber">Partial</span>;
    case 'basic':
      return <span className="text-xs text-amber">Basic</span>;
    default:
      return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  }
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th className="pb-4 text-left font-medium text-muted-foreground">
          <span className="sr-only">Feature</span>
        </th>
        {COMPETITORS.map((name, i) => (
          <th
            key={name}
            className={`pb-4 text-center font-heading text-sm font-semibold ${i === 0 ? 'text-primary' : 'text-foreground'}`}
          >
            {name}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TableRow({ row }: { row: ComparisonRow }) {
  return (
    <tr className="border-t border-border transition-colors hover:bg-foreground/[0.02]">
      <td className="py-3 pr-4 text-sm text-foreground">{row.feature}</td>
      {COMPETITOR_KEYS.map((key, i) => (
        <td key={key} className={`py-3 text-center ${i === 0 ? 'bg-primary/8' : ''}`}>
          <CellDisplay value={row[key]} highlight={i === 0} />
        </td>
      ))}
    </tr>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-12 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <TableHead />
        <tbody>
          {ROWS.map((row) => (
            <TableRow key={row.feature} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Comparison() {
  return (
    <section id="comparison" className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Quick Comparison
        </h2>

        <ComparisonTable />
      </div>
    </section>
  );
}
