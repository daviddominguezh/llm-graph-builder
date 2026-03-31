/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { z } from 'zod';

import { createOrder, createPaymentLink } from '@/app/components/messages/services/api';

import { DiscountAwareSummary } from '@/app/components/messages/shared/stubs';
import { calculateOrderTotal } from '@/app/components/messages/shared/stubs';

import { Address, AddressForm } from '@/app/components/messages/shared/stubs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { BusinessSetupSchemaAPIType } from '@/app/types/business';
import type { Cart, CartItem } from '@/app/types/cart';
import type { AddressSchemaType, Order, PaymentItem } from '@/app/types/orders';
import { PAYMENT_METHOD } from '@/app/types/payments';

interface CreateOrderFromCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Cart;
  businessInfo: BusinessSetupSchemaAPIType;
  projectName: string;
  userID: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerNationalId?: string;
  customerAddress?: AddressSchemaType;
  onOrderCreated: () => void;
  onPaymentLinkCreated: (paymentLink: string) => void;
}

// Form validation schema
const customerFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  userNationalId: z.string().min(1, 'National ID is required'),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

export const CreateOrderFromCartModal: React.FC<CreateOrderFromCartModalProps> = ({
  isOpen,
  onClose,
  cart,
  businessInfo,
  projectName,
  userID,
  customerName = '',
  customerEmail = '',
  customerPhone = '',
  customerNationalId = '',
  customerAddress,
  onOrderCreated,
  onPaymentLinkCreated,
}) => {
  const t = useTranslations('messages');

  const [step, setStep] = useState<'form' | 'payment-method' | 'payment-link'>('form');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'online' | null>(null);
  const [address, setAddress] = useState<Address>({
    ciudadId: '',
    cityName: '',
    barrio: '',
    direccion: '',
    detalle: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Form for customer information
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    getValues,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: customerName,
      email: customerEmail,
      userNationalId: customerNationalId,
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setSelectedPaymentMethod(null);
      setAddress({
        ciudadId: customerAddress?.ciudadId || '',
        cityName: customerAddress?.cityName || '',
        barrio: customerAddress?.barrio || '',
        direccion: customerAddress?.direccion || '',
        detalle: customerAddress?.detalle || '',
      });
      setError(null);
      setPaymentLink('');
      setCopied(false);
      reset({
        name: customerName,
        email: customerEmail,
        userNationalId: customerNationalId,
      });
    }
  }, [isOpen, customerName, customerEmail, customerNationalId, customerAddress, reset]);

  // Watch specific form values to enable/disable continue button
  const watchedName = watch('name');
  const watchedEmail = watch('email');
  const watchedNationalId = watch('userNationalId');

  const isFormValid = useMemo(() => {
    // Check customer info fields (with type safety)
    const hasName = Boolean(typeof watchedName === 'string' && watchedName.trim());
    const hasEmail = Boolean(typeof watchedEmail === 'string' && watchedEmail.trim());
    // National ID can be either string or number
    const hasNationalId = Boolean(
      (typeof watchedNationalId === 'string' && watchedNationalId.trim()) ||
        (typeof watchedNationalId === 'number' && !isNaN(watchedNationalId))
    );

    // Check address fields
    const hasCity = Boolean(typeof address.ciudadId === 'string' && address.ciudadId.trim());
    const hasNeighborhood = Boolean(typeof address.barrio === 'string' && address.barrio.trim());
    const hasStreetAddress = Boolean(typeof address.direccion === 'string' && address.direccion.trim());

    // Check form errors
    const hasNoErrors = Object.keys(errors).length === 0;

    return (
      hasName && hasEmail && hasNationalId && hasCity && hasNeighborhood && hasStreetAddress && hasNoErrors
    );
  }, [watchedName, watchedEmail, watchedNationalId, address, errors]);

  // Convert cart items to order items
  const orderItems: PaymentItem[] = useMemo(() => {
    const products = businessInfo?.products?.products || [];
    return Object.values(cart).map((item: CartItem) => {
      const product = products.find((p) => p.id === item.id);
      return {
        id: item.id,
        productName: product?.name || item.id,
        quantity: item.quantity,
        personalizations: item.personalizations || undefined,
      };
    });
  }, [cart, businessInfo]);

  // Calculate order total
  const orderCalculation = useMemo(() => {
    if (!address.ciudadId) return null;

    return calculateOrderTotal(
      businessInfo as any, // Type assertion to work around country code typo (EUC vs ECU)
      orderItems,
      address,
      new Date(),
      0, // previousPurchases
      undefined, // paymentMethod - will be set when user selects
      t
    );
  }, [businessInfo, orderItems, address, t]);

  // Handle form submission (customer info step)
  const onFormSubmit = handleSubmit(() => {
    if (!address.ciudadId || !address.barrio || !address.direccion) {
      setError(t('Please fill all required fields'));
      return;
    }

    // Store form data and move to payment method selection
    setStep('payment-method');
    setError(null);
  });

  // Handle cash-on-delivery order creation
  const handleCashOnDelivery = useCallback(async () => {
    const formData = getValues();

    if (!address.ciudadId || !address.barrio || !address.direccion) {
      setError(t('Please fill all required fields'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderData: Order = {
        id: `order-${Date.now()}`,
        name: formData.name,
        email: formData.email,
        phone: customerPhone,
        userNationalId: String(formData.userNationalId),
        status: 'unpaid',
        address: address,
        items: orderItems,
        amount: orderCalculation?.total || 0,
        paidOnDelivery: true,
        paymentMethod: PAYMENT_METHOD.ON_DELIVERY,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await createOrder(projectName, orderData);

      // Order created successfully
      onOrderCreated();
      onClose();
    } catch (err) {
      console.error('Error creating order:', err);
      setError(t('Failed to create order'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    getValues,
    address,
    orderItems,
    orderCalculation,
    customerPhone,
    projectName,
    onOrderCreated,
    onClose,
    t,
  ]);

  // Handle online payment link creation
  const handleOnlinePayment = useCallback(async () => {
    const formData = getValues();

    if (!address.ciudadId || !address.barrio || !address.direccion) {
      setError(t('Please fill all required fields'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const paymentData = {
        name: formData.name,
        email: formData.email,
        userNationalId: String(formData.userNationalId),
        address: {
          ciudadId: address.ciudadId,
          direccion: address.direccion,
          departamentoId: '', // Not used in Address type
          barrio: address.barrio,
        },
      };

      const response = await createPaymentLink(projectName, userID, paymentData);

      // Payment link created successfully
      setPaymentLink(response.paymentLink);
      setStep('payment-link');
    } catch (err) {
      console.error('Error creating payment link:', err);
      setError(t('Failed to create payment link'));
    } finally {
      setIsSubmitting(false);
    }
  }, [getValues, address, projectName, userID, t]);

  // Handle copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error copying link:', err);
      setError(t('Failed to copy link'));
    }
  }, [paymentLink, t]);

  // Handle send link to chat
  const handleSendToChat = useCallback(() => {
    onPaymentLinkCreated(paymentLink);
    onClose();
  }, [paymentLink, onPaymentLinkCreated, onClose]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === 'payment-method') {
      setStep('form');
    } else if (step === 'payment-link') {
      setStep('payment-method');
    }
  }, [step]);

  // Handle create order button click
  const handleCreateOrder = useCallback(() => {
    if (selectedPaymentMethod === 'cash') {
      handleCashOnDelivery();
    } else if (selectedPaymentMethod === 'online') {
      handleOnlinePayment();
    }
  }, [selectedPaymentMethod, handleCashOnDelivery, handleOnlinePayment]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl z-[150] max-h-[90vh] overflow-hidden flex flex-col"
      >
        <DialogHeader className="border-b pb-4">
          <DialogTitle>{t('Order from Shopping Cart')}</DialogTitle>
          <DialogDescription>{t('Review and confirm your order details')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-0 py-0">
          {step === 'form' && (
            <div className="space-y-6">
              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-3">{t('Order Items')}</h3>
                <div className="space-y-2 rounded-md border p-4">
                  {orderItems.map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex justify-between text-sm">
                      <div>
                        <div className="font-medium">{item.productName}</div>
                        {item.personalizations && item.personalizations.length > 0 && (
                          <div className="text-gray-500">
                            ({item.personalizations.map((p) => `${p.type}: ${p.value}`).join(', ')})
                          </div>
                        )}
                      </div>
                      <span>x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Information */}
              <div>
                <h3 className="font-semibold mb-3">{t('Customer Information')}</h3>
                <div className="space-y-4 mx-1">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="name">{t('Name')} *</Label>
                    <Input id="name" {...register('name')} />
                    {errors.name && (
                      <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="email">{t('Email')} *</Label>
                    <Input id="email" type="email" {...register('email')} />
                    {errors.email && (
                      <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="userNationalId">{t('National ID')} *</Label>
                    <Input id="userNationalId" {...register('userNationalId')} />
                    {errors.userNationalId && (
                      <p className="text-red-600 text-sm mt-1">{errors.userNationalId.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="font-semibold mb-3">{t('Address')}</h3>
                <AddressForm address={address} onAddressChange={setAddress} showTitle={false} />
              </div>

              {/* Order Summary */}
              {address.ciudadId && orderCalculation && (
                <div>
                  <h3 className="font-semibold mb-3">{t('Order Summary')}</h3>
                  <DiscountAwareSummary result={orderCalculation} />
                </div>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
          )}

          {step === 'payment-method' && (
            <div className="space-y-3">
              <p className="text-sm text-black">{t('Select your payment method')}:</p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('cash')}
                  className={`h-24 rounded-md border transition-all flex items-center justify-center font-medium cursor-pointer shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
                    selectedPaymentMethod === 'cash'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {t('Cash on Delivery')}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('online')}
                  className={`h-24 rounded-md border transition-all flex items-center justify-center font-medium cursor-pointer shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
                    selectedPaymentMethod === 'online'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {t('Pay Online')}
                </button>
              </div>

              {error && <p className="text-red-600 text-sm text-center">{error}</p>}
            </div>
          )}

          {step === 'payment-link' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">{t('Payment Link')}</h3>
                <div className="flex gap-2">
                  <Input value={paymentLink} readOnly className="flex-1" />
                  <Button onClick={handleCopyLink} variant="outline" size="sm">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                </div>
                {copied && (
                  <p className="text-green-600 text-sm mt-1">{t('Link copied to clipboard')}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSendToChat} className="flex-1">
                  {t('Send to Chat')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('Cancel')}
              </Button>
              <Button onClick={onFormSubmit} disabled={!isFormValid}>
                {t('Continue')}
              </Button>
            </>
          )}

          {step === 'payment-method' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                {t('Back')}
              </Button>
              <Button onClick={handleCreateOrder} disabled={!selectedPaymentMethod || isSubmitting}>
                {isSubmitting
                  ? selectedPaymentMethod === 'cash'
                    ? t('Creating order...')
                    : t('Creating payment link...')
                  : t('Create Order')}
              </Button>
            </>
          )}

          {step === 'payment-link' && (
            <Button variant="outline" onClick={onClose}>
              {t('Close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
