import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertCircleIcon } from 'lucide-react';

/**
 * InquiryModal component for handling user inquiries that require attention
 */
interface InquiryModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  response: string;
  onResponseChange: (response: string) => void;
  onResolve: () => void;
  isLoading?: boolean;
}

export const InquiryModal: React.FC<InquiryModalProps> = ({
  isOpen,
  onOpenChange,
  query,
  response,
  onResponseChange,
  onResolve,
  isLoading = false,
}) => {
  const t = useTranslations('messages');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger>
        <div
          onClick={() => onOpenChange(true)}
          className="items-center mt-[-16px] ml-[-1px] absolute z-10 left-0 w-[calc(100%+2px)] flex"
        >
          <Alert
            variant="destructive"
            className="flex items-center justify-between rounded-none w-full"
          >
            <div className="flex items-center gap-4">
              <AlertCircleIcon />
              <AlertTitle className="text-wrap break-normal overflow-auto flex">
                {t('The user has asked a question that requires your attention')}
              </AlertTitle>
            </div>
            <Button>{t('Solve Inquiry')}</Button>
          </Alert>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]" aria-describedby="Modal to fill inquiry">
        <DialogHeader>
          <DialogTitle>{t('Resolve Inquiry')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          <div className="mb-6 text-gray-600">{query}</div>

          <Textarea
            value={response}
            onChange={(e) => onResponseChange(e.target.value)}
            placeholder={t('Enter your response')}
          />

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" className="rounded-md" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={onResolve}
              disabled={response.trim().length === 0 || isLoading}
              style={{
                backgroundColor: '#111111',
                borderColor: '#111111',
                color: 'white',
                fontWeight: '500',
                fontSize: '0.95rem',
                borderRadius: '4px',
              }}
            >
              {t('Resolve')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

InquiryModal.displayName = 'InquiryModal';
