import { Check, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CellValue, ComparisonRow } from './comparison-data';
import { COMPETITOR_KEYS, COMPETITORS, ROWS } from './comparison-data';
import { SectionHeading } from './SectionHeading';

function CellDisplay({ value, highlight }: { value: CellValue; highlight: boolean }): ReactNode {
  switch (value) {
    case 'yes':
      return <Check className={`mx-auto h-4 w-4 ${highlight ? 'text-[#533afd]' : 'text-[#425466]'}`} />;
    case 'no':
      return <X className="mx-auto h-4 w-4 text-[#425466]/40" />;
    case 'partial':
      return <span className="text-xs text-amber">Partial</span>;
    case 'basic':
      return <span className="text-xs text-amber">Basic</span>;
    default:
      return <Minus className="mx-auto h-4 w-4 text-[#425466]/40" />;
  }
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th scope="col" className="pb-4 text-left font-medium text-[#425466]">
          <span className="sr-only">Feature</span>
        </th>
        {COMPETITORS.map((name, i) => (
          <th
            scope="col"
            key={name}
            className={`pb-4 text-center text-sm font-medium ${i === 0 ? 'text-[#533afd]' : 'text-[#061b31]'}`}
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
    <tr className={`border-t border-dashed border-neutral-800 ${row.emphasis === true ? 'bg-[#061b31]/2 font-medium' : ''}`}>
      <td className="py-3 pr-4 text-sm text-[#061b31]">{row.feature}</td>
      {COMPETITOR_KEYS.map((key, i) => (
        <td key={key} className={`py-3 text-center ${i === 0 ? 'bg-[#533afd]/4' : ''}`}>
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
    <section id="comparison" className="bg-white px-10 py-24">
      <div className="mx-auto max-w-[1240px]">
        <SectionHeading
          lead="How OpenFlow compares."
          rest="The only open-source option built for reselling agents to your own customers."
        />
        <ComparisonTable />
      </div>
    </section>
  );
}
