import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { FlaskConical } from 'lucide-react';
import QRCode from 'qrcode';

import Spinner from '@/app/components/messages/shared/spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChatbotLabModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ChatbotLabModal = ({ open, onOpenChange }: ChatbotLabModalProps) => {
  const { t } = useTranslation();
  const { projectName } = useParams<{ projectName: string }>();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && projectName) {
      setIsLoading(true);
      setQrCodeUrl(null);

      const whatsappUrl = `https://wa.me/573223874864?text=join-test:${projectName}`;

      QRCode.toDataURL(whatsappUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((url) => {
          setQrCodeUrl(url);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Error generating QR code:', err);
          setIsLoading(false);
        });
    }
  }, [open, projectName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {t('Chatbot Lab')}
          </DialogTitle>
          <DialogDescription>{t('Test and experiment with your chatbot settings.')}</DialogDescription>
        </DialogHeader>

        <div className="py-4 flex flex-col items-center justify-center min-h-[280px]">
          {isLoading ? (
            <Spinner size="big" />
          ) : qrCodeUrl ? (
            <div className="flex flex-col items-center gap-4">
              <img src={qrCodeUrl} alt={t('QR Code')} className="w-64 h-64" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('Unable to generate QR code')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
