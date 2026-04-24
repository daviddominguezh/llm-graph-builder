export function formatCsvRow(cells: string[]): string {
  return cells.map(escapeCell).join(',');
}

function escapeCell(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}
