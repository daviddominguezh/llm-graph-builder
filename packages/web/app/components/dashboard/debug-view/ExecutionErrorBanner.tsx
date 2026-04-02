import type { ExecutionSummaryRow } from '@/app/lib/dashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface ExecutionErrorBannerProps {
  execution: ExecutionSummaryRow;
  label: string;
}

export function ExecutionErrorBanner({ execution, label }: ExecutionErrorBannerProps) {
  if (execution.status !== 'failed' || execution.error === null || execution.error === '') {
    return null;
  }

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertCircle />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{execution.error}</AlertDescription>
    </Alert>
  );
}
