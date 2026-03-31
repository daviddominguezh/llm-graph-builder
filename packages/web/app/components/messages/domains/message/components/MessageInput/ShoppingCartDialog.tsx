import ProductBGImg from '@/app/components/messages/shared/assets';
import { formatCurrency } from '@/app/components/messages/shared/utilStubs';
import type { BusinessSetupSchemaAPIType, ProductBusinessSetupSchemaAPIType } from '@/app/types/business';
import { Cart, CartItem } from '@/app/types/cart';
import type { AddressSchemaType } from '@/app/types/orders';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, ShoppingCart as ShoppingCartIcon, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import React, { useMemo, useState } from 'react';

import { AddToCartDialog } from './AddToCartDialog';
import { CreateOrderFromCartModal } from './CreateOrderFromCartModal';
import { DeleteCartItemModal } from './DeleteCartItemModal';

interface ShoppingCartDialogProps {
  cart: Cart | null;
  loading: boolean;
  businessInfo: BusinessSetupSchemaAPIType | null;
  projectName: string;
  userID: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerNationalId?: string;
  customerAddress?: AddressSchemaType;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onAddItem: (item: CartItem) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onOrderCreated?: () => void;
  onPaymentLinkCreated?: (paymentLink: string) => void;
}

/**
 * Calculate the price for a product with personalizations
 */
const calculateItemPrice = (
  productId: string,
  personalizations: Array<{ type: string; value: string }> | null,
  products: ProductBusinessSetupSchemaAPIType[]
): number => {
  const product = products.find((p) => p.id === productId);
  if (!product) return 0;

  const price = product.price;

  // If no personalizations, return base price
  if (!personalizations || personalizations.length === 0) {
    return price;
  }

  // Check for product-specific personalization combination pricing
  if (product.personalizationCombinationPricing && product.personalizationCombinationPricing.length > 0) {
    // Try to find exact match for this combination
    for (const combo of product.personalizationCombinationPricing) {
      if (combo.combination && combo.combination.length === personalizations.length) {
        // Check if all personalizations match
        const matches = combo.combination.every((cp: { type: string; value: string }) => {
          return personalizations.some((p) => p.type === cp.type && p.value === cp.value);
        });

        if (matches && typeof combo.customPrice === 'number') {
          return combo.customPrice;
        }
      }
    }
  }

  // No combination match - product personalizations don't have individual pricing
  // The pricing comes from global personalizations which would need to be fetched
  // For now, just return the base price
  return price;
};

/**
 * Find the media URL for a product based on its personalizations
 * Matches the logic used in ProductGrid for consistency
 */
const findMediaForPersonalizations = (
  product: ProductBusinessSetupSchemaAPIType,
  itemPersonalizations: Array<{ type: string; value: string }> | null
): string | null => {
  const productMedia = product.media || [];

  for (const mediaItem of productMedia) {
    if (typeof mediaItem === 'string') continue;

    // If media has no personalizations, it's the default image
    if (!mediaItem.personalizations || mediaItem.personalizations.length === 0) {
      // Continue looking for a more specific match if we have personalizations
      if (itemPersonalizations && itemPersonalizations.length > 0) {
        continue;
      }
      return mediaItem.url || null;
    }

    // Check if all media personalizations match the item's personalizations
    if (itemPersonalizations && itemPersonalizations.length > 0) {
      const mediaMatches = mediaItem.personalizations.every(
        (mediaPers: { type: string; values: string[] }) => {
          const matchingValues = mediaPers.values || [];
          // Check if any of the media's personalization values match the item's value for this type
          return matchingValues.some((mediaValue: string) => {
            return itemPersonalizations.some(
              (itemPers) => itemPers.type === mediaPers.type && itemPers.value === mediaValue
            );
          });
        }
      );

      if (mediaMatches) {
        return mediaItem.url || null;
      }
    }
  }

  // Fallback: return first media item's URL if available
  for (const mediaItem of productMedia) {
    if (typeof mediaItem !== 'string' && mediaItem.url) {
      return mediaItem.url;
    }
  }

  return null;
};

/**
 * Shopping cart item card component
 */
const CartItemCard: React.FC<{
  item: CartItem;
  product: ProductBusinessSetupSchemaAPIType | null;
  currency: string;
  onDelete: () => void;
}> = ({ item, product, currency, onDelete }) => {
  const t = useTranslations('messages');

  if (!product) {
    return (
      <div className="border rounded-md p-3 bg-gray-50">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="text-sm text-gray-500">{t('Not found')}</p>
            <p className="text-xs text-gray-400">ID: {item.id}</p>
          </div>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-50 rounded text-red-600 transition-colors cursor-pointer"
            aria-label={t('Remove')}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Find the appropriate image based on personalizations
  const itemImage = findMediaForPersonalizations(product, item.personalizations || null);

  return (
    <div className="border rounded-md p-3 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="relative w-16 h-16 rounded overflow-hidden shrink-0">
          <Image
            src={ProductBGImg}
            alt=""
            width={0}
            height={0}
            sizes="100vw"
            className="absolute inset-0 w-full h-full object-cover"
            unoptimized
          />
          {itemImage && (
            <Image
              src={itemImage}
              alt={product.name}
              width={0}
              height={0}
              sizes="100vw"
              className="absolute inset-0 w-full h-full object-cover z-10"
              unoptimized
            />
          )}
        </div>

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{product.name}</h4>
              <p className="text-xs text-gray-600">
                {t('Quantity')}: {item.quantity}
              </p>
            </div>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-50 rounded text-red-600 transition-colors shrink-0 cursor-pointer"
              aria-label={t('Remove')}
              title={t('Remove from cart')}
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Personalizations */}
          {item.personalizations && item.personalizations.length > 0 && (
            <div className="mt-1">
              <p className="text-xs text-gray-500">
                {item.personalizations.map((p, idx) => (
                  <span key={idx}>
                    {p.type}: {p.value}
                    {idx < (item.personalizations?.length || 0) - 1 && ' • '}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Price */}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-sm font-semibold">
              $
              {formatCurrency(
                calculateItemPrice(item.id, item.personalizations || null, [product]).toString()
              )}
            </span>
            <span className="text-xs text-gray-500">{currency.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ShoppingCartDialog: React.FC<ShoppingCartDialogProps> = ({
  cart,
  loading,
  businessInfo,
  projectName,
  userID,
  customerName,
  customerEmail,
  customerPhone,
  customerNationalId,
  customerAddress,
  onClose,
  onRefresh,
  onAddItem,
  onRemoveItem,
  onOrderCreated,
  onPaymentLinkCreated,
}) => {
  const t = useTranslations('messages');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CartItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const products = useMemo(() => businessInfo?.products?.products || [], [businessInfo?.products?.products]);

  // Get currency based on country code
  const getCurrency = (countryCode?: string): string => {
    if (countryCode === 'COL') return 'COP';
    return 'USD';
  };

  const currency = getCurrency(businessInfo?.info?.countryCode);

  // Convert cart object to array for easier rendering
  const cartItems = useMemo(() => {
    if (!cart) return [];
    return Object.values(cart);
  }, [cart]);

  // Calculate total cart value
  const totalValue = useMemo(() => {
    if (!cartItems || cartItems.length === 0) return 0;

    return cartItems.reduce((total, item) => {
      const itemPrice = calculateItemPrice(item.id, item.personalizations || null, products);
      return total + itemPrice * item.quantity;
    }, 0);
  }, [cartItems, products]);

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (item: CartItem) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      await onRemoveItem(itemToDelete.id);
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle add item
  const handleAddItem = async (item: CartItem) => {
    await onAddItem(item);
    setShowAddDialog(false);
  };

  // Handle order created (refresh cart and notify parent)
  const handleOrderCreated = async () => {
    await onRefresh();
    if (onOrderCreated) {
      onOrderCreated();
    }
  };

  // Handle payment link created
  const handlePaymentLinkCreated = (paymentLink: string) => {
    if (onPaymentLinkCreated) {
      onPaymentLinkCreated(paymentLink);
    }
    // Refresh cart after payment link is created
    onRefresh();
  };

  const isEmpty = cartItems.length === 0;

  return (
    <>
      <div className="bg-white rounded-md border border-gray-300 shadow-lg h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b shrink-0">
          <ShoppingCartIcon size={20} className="text-gray-700" />
          <h2 className="flex-1 font-semibold text-lg">{t('Shopping Cart')}</h2>

          <Button
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="w-8 h-8 rounded-md shrink-0 p-0"
            title={t('Recharge')}
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>

          <Button
            variant="ghost"
            onClick={onClose}
            className="w-8 h-8 rounded-md shrink-0 p-0"
            title={t('Close')}
          >
            <X size={20} />
          </Button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">{t('Loading…')}</p>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <ShoppingCartIcon size={48} className="text-gray-300" />
              <p className="text-gray-500">{t('Your cart is empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item, index) => (
                <CartItemCard
                  key={`${item.id}-${index}`}
                  item={item}
                  product={products.find((p) => p.id === item.id) || null}
                  currency={currency}
                  onDelete={() => handleDeleteClick(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer with total and add button - always visible */}
        <div className="border-t p-4 shrink-0 space-y-3">
          {!isEmpty && (
            <div className="flex justify-between items-center">
              <span className="font-semibold">{t('total')}:</span>
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold">${formatCurrency(totalValue.toString())}</span>
                <span className="text-sm text-gray-500">{currency.toUpperCase()}</span>
              </div>
            </div>
          )}
          <Button onClick={() => setShowAddDialog(true)} className="w-full" size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            {t('Add Item')}
          </Button>
          {!isEmpty && (
            <Button onClick={() => setShowCreateOrderModal(true)} className="w-full" size="sm">
              {t('Create Order')}
            </Button>
          )}
        </div>
      </div>

      {/* Add to cart dialog */}
      <AddToCartDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddItem}
        projectName={projectName}
      />

      {/* Delete confirmation modal */}
      <DeleteCartItemModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        item={itemToDelete}
        productName={itemToDelete ? products.find((p) => p.id === itemToDelete.id)?.name : undefined}
        isDeleting={isDeleting}
      />

      {/* Create order modal */}
      {cart && businessInfo && (
        <CreateOrderFromCartModal
          isOpen={showCreateOrderModal}
          onClose={() => setShowCreateOrderModal(false)}
          cart={cart}
          businessInfo={businessInfo}
          projectName={projectName}
          userID={userID}
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          customerNationalId={customerNationalId}
          customerAddress={customerAddress}
          onOrderCreated={handleOrderCreated}
          onPaymentLinkCreated={handlePaymentLinkCreated}
        />
      )}
    </>
  );
};
