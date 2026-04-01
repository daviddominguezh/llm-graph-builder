import React, { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { AlertTriangle } from 'lucide-react';

import { verifyPayment } from '@/app/components/messages/services/api';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useAppDispatch } from '@/app/components/messages/store/mainStore';

import { clearVerifyPaymentStatus } from '@/app/components/messages/store';

interface PaymentVerificationBannerProps {
  chatId: string;
}

const PAYMENT_CONFIRMED_MESSAGE = 'Pago confirmado exitosamente';
const PAYMENT_REJECTED_MESSAGE = 'Pago rechazado, informarle al usuario que su pago no fue recibido';

export const PaymentVerificationBanner: React.FC<PaymentVerificationBannerProps> = ({ chatId }) => {
  const t = useTranslations('messages');
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : (params.projectName?.[0] ?? 'nike');
  const dispatch = useAppDispatch();
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const handleConfirmPayment = useCallback(async () => {
    if (!projectName) {
      console.error('Project name not found');
      return;
    }

    // Optimistically clear the verify-payment status immediately
    dispatch(clearVerifyPaymentStatus({ chatId }));
    setIsConfirmModalOpen(false);

    // Make the API call (fire and forget for optimistic update)
    try {
      const success = await verifyPayment({
        message: PAYMENT_CONFIRMED_MESSAGE,
        userID: chatId,
        namespace: projectName,
        confirmed: true,
      });

      if (!success) {
        console.error('Failed to confirm payment for chat:', chatId);
      }
    } catch (error) {
      console.error('Error confirming payment:', error);
    }
  }, [chatId, projectName, dispatch]);

  const handleRejectPayment = useCallback(async () => {
    if (!projectName) {
      console.error('Project name not found');
      return;
    }

    // Optimistically clear the verify-payment status immediately
    dispatch(clearVerifyPaymentStatus({ chatId }));
    setIsRejectModalOpen(false);

    // Make the API call (fire and forget for optimistic update)
    try {
      const success = await verifyPayment({
        message: PAYMENT_REJECTED_MESSAGE,
        userID: chatId,
        namespace: projectName,
        confirmed: false,
      });

      if (!success) {
        console.error('Failed to reject payment for chat:', chatId);
      }
    } catch (error) {
      console.error('Error rejecting payment:', error);
    }
  }, [chatId, projectName, dispatch]);

  return (
    <>
      <div className="w-full px-4 py-4 bg-white">
        <Alert className="w-full border-amber-300 bg-amber-50 rounded-lg flex flex-col gap-2">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle className="text-amber-800 font-semibold">
              {t('verify-payment-banner-title')}
            </AlertTitle>
          </div>

          <AlertDescription className="text-amber-700 mt-1">
            {t('verify-payment-banner-description')}
          </AlertDescription>
          <div className="w-full flex gap-2 mt-3 justify-end">
            <Button variant="destructive" onClick={() => setIsRejectModalOpen(true)}>
              {t('verify-payment-reject')}
            </Button>
            <Button variant="default" onClick={() => setIsConfirmModalOpen(true)}>
              {t('verify-payment-confirm')}
            </Button>
          </div>
        </Alert>
      </div>

      {/* Confirm Payment Modal */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('verify-payment-confirm-title')}</DialogTitle>
            <DialogDescription>{t('verify-payment-confirm-description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmModalOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleConfirmPayment}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {t('Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('verify-payment-reject-title')}</DialogTitle>
            <DialogDescription>{t('verify-payment-reject-description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRejectPayment}>
              {t('Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
