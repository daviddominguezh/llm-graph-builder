import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Button } from '@components/ui/button';

import { CartItem } from '@globalTypes/cart';

interface DeleteCartItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  item: CartItem | null;
  productName?: string;
  isDeleting?: boolean;
}

export const DeleteCartItemModal: React.FC<DeleteCartItemModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  productName,
  isDeleting = false,
}) => {
  const { t } = useTranslation();

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="z-[150]"
        overlayClassName="z-[150]"
        onPointerDownOutside={(e) => {
          if (isDeleting) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isDeleting) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Remove item from cart')}</DialogTitle>
          <DialogDescription>
            {t('Are you sure you want to remove this item from your cart?')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-2">
            <div>
              <span className="font-medium">{t('Product')}:</span> {productName || item.id}
            </div>
            <div>
              <span className="font-medium">{t('Quantity')}:</span> {item.quantity}
            </div>
            {item.personalizations && item.personalizations.length > 0 && (
              <div>
                <span className="font-medium">{t('Personalizations')}:</span>
                <ul className="ml-4 mt-1 list-disc">
                  {item.personalizations.map((p, idx) => (
                    <li key={idx}>
                      {p.type}: {p.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            {t('Cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? t('Removing...') : t('Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
