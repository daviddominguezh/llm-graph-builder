export function formatCsvRow(cells: string[]): string {
  return cells.map(escapeCell).join(',');
}

function escapeCell(cell: string): string {
  if (/[",\n\r]/v.test(cell)) return `"${cell.replace(/"/gv, '""')}"`;
  return cell;
}
