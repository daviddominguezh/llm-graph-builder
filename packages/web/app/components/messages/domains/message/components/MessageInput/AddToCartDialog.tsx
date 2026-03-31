import { getBusinessInfo, getStoreData } from '@/app/components/messages/services/api';
import { formatCurrency } from '@/app/components/messages/shared/utilStubs';
import {
  getAvailablePersonalizationValues,
  getAvailableStock,
  isPersonalizationCombinationInStock,
  isQuantityExceedsStock,
} from '@/app/components/messages/shared/utilStubs';
import { BusinessSetupSchemaAPIType, ProductBusinessSetupSchemaAPIType } from '@/app/types/business';
import { CartItem } from '@/app/types/cart';
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
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

// Define the ProductStock type locally
type ProductStock = {
  id: string;
  name?: string;
  personalizations: Array<{
    stock: number;
    available?: boolean;
    withStock?: boolean;
    options: Array<{
      type: string;
      value: string;
    }>;
  }>;
};

interface AddToCartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: CartItem) => Promise<void>;
  projectName: string;
}

export const AddToCartDialog: React.FC<AddToCartDialogProps> = ({ isOpen, onClose, onAdd, projectName }) => {
  const t = useTranslations('messages');

  const [products, setProducts] = useState<ProductBusinessSetupSchemaAPIType[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [personalizations, setPersonalizations] = useState<Array<{ type: string; value: string }>>([]);

  const fetchProducts = useCallback(async () => {
    if (!projectName) return;

    setIsLoadingProducts(true);
    try {
      const [businessData] = await Promise.all([getBusinessInfo(projectName), getStoreData(projectName)]);

      const businessInfo = businessData as BusinessSetupSchemaAPIType;

      if (businessInfo?.products?.products) {
        setProducts(businessInfo.products.products);
      }

      // Get stock data
      const stockInfo = businessInfo?.stock?.stock || [];
      setStockData(stockInfo as ProductStock[]);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [projectName]);

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      // Reset form when dialog opens
      setSelectedProductId('');
      setQuantity(1);
      setPersonalizations([]);
    }
  }, [isOpen, fetchProducts]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    setPersonalizations([]); // Reset personalizations when product changes
  };

  const handlePersonalizationChange = (personalizationType: string, value: string) => {
    setPersonalizations((prev) => {
      const existingIndex = prev.findIndex((p) => p.type === personalizationType);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex].value = value;
        return updated;
      } else {
        return [...prev, { type: personalizationType, value }];
      }
    });
  };

  // Check if all required personalizations are selected
  const allPersonalizationsSelected = useMemo(() => {
    if (!selectedProduct?.personalizations || selectedProduct.personalizations.length === 0) {
      return true; // No personalizations required
    }

    const requiredTypes = selectedProduct.personalizations.map((p) => p.type);
    const selectedTypes = personalizations.map((p) => p.type);

    return requiredTypes.every((type) => selectedTypes.includes(type));
  }, [selectedProduct, personalizations]);

  // Check stock availability
  const isInStock = useMemo(() => {
    if (!selectedProductId || !allPersonalizationsSelected) return true;
    return isPersonalizationCombinationInStock(selectedProductId, personalizations, stockData);
  }, [selectedProductId, personalizations, stockData, allPersonalizationsSelected]);

  const quantityExceedsStock = useMemo(() => {
    if (!selectedProductId || !allPersonalizationsSelected) return false;
    return isQuantityExceedsStock(selectedProductId, personalizations, quantity, stockData);
  }, [selectedProductId, personalizations, quantity, stockData, allPersonalizationsSelected]);

  const availableStock = useMemo(() => {
    if (!selectedProductId || !allPersonalizationsSelected) return null;
    return getAvailableStock(selectedProductId, personalizations, stockData);
  }, [selectedProductId, personalizations, stockData, allPersonalizationsSelected]);

  // Check if form is valid
  const canAdd = useMemo(() => {
    return (
      selectedProductId &&
      !selectedProductId.startsWith('temp-') &&
      quantity > 0 &&
      allPersonalizationsSelected &&
      isInStock &&
      !quantityExceedsStock
    );
  }, [selectedProductId, quantity, allPersonalizationsSelected, isInStock, quantityExceedsStock]);

  const handleAdd = async () => {
    if (!canAdd) return;

    setIsAdding(true);
    try {
      const item: CartItem = {
        id: selectedProductId,
        quantity,
        personalizations: personalizations.length > 0 ? personalizations : null,
      };

      await onAdd(item);
      onClose(); // Close dialog on success
    } catch (error) {
      console.error('Error adding item to cart:', error);
      // Error handling is done in parent component
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl z-[150]">
        <DialogHeader>
          <DialogTitle>{t('Add Item to Cart')}</DialogTitle>
          <DialogDescription>
            {t('Select a product and its options to add to your shopping cart·')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Selection */}
          <div>
            <Label className="mb-2 inline-block">{t('Product')} *</Label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductSelect(e.target.value)}
              disabled={isLoadingProducts || products.length === 0}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">{isLoadingProducts ? t('Loading products…') : t('Select a product')}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - ${formatCurrency(product.price.toString())}
                </option>
              ))}
            </select>
          </div>

          {/* Personalizations Section */}
          {selectedProduct &&
            selectedProduct.personalizations &&
            selectedProduct.personalizations.length > 0 && (
              <div className="space-y-3">
                <Label className="font-semibold">{t('Personalizations')}</Label>
                {selectedProduct.personalizations
                  .sort((a, b) => a.type.localeCompare(b.type))
                  .map((personalizationType) => (
                    <div key={personalizationType.type} className="space-y-1">
                      <Label className="text-sm">{personalizationType.type} *</Label>
                      <select
                        value={personalizations.find((p) => p.type === personalizationType.type)?.value || ''}
                        onChange={(e) =>
                          handlePersonalizationChange(personalizationType.type, e.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t('Select')}</option>
                        {getAvailablePersonalizationValues(
                          selectedProductId,
                          personalizationType.type,
                          personalizations,
                          stockData,
                          products
                        ).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                {/* Stock Warning */}
                {allPersonalizationsSelected && !isInStock && (
                  <div className="text-red-600 text-sm mt-2">⚠️ {t('This combination is out of stock')}</div>
                )}
              </div>
            )}

          {/* Quantity */}
          {selectedProduct && (
            <div>
              <Label className="mb-2 inline-block">{t('Quantity')} *</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                disabled={!allPersonalizationsSelected || !isInStock}
              />

              {/* Stock validation message */}
              {allPersonalizationsSelected && quantityExceedsStock && availableStock !== null && (
                <div className="text-red-600 text-sm mt-1">
                  ⚠️ {t('Only {{stock}} units available', { stock: availableStock })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAdding}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd || isAdding}>
            {isAdding ? t('Adding…') : t('Place in Cart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
