import ProductBGImg from '@/app/components/messages/shared/assets';
import { formatCurrency } from '@/app/components/messages/shared/utilStubs';
import type { BusinessSetupSchemaAPIType, ProductBusinessSetupSchemaAPIType } from '@/app/types/business';
import { Button } from '@/components/ui/button';
import { Check, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ProductsDialogProps {
  businessInfo: BusinessSetupSchemaAPIType | null;
  businessInfoLoading: boolean;
  projectName: string;
  onClose: () => void;
  onSendProductCard: (productId: string, selectedImageId: string | null) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Simplified product card for the products dialog
 * Based on the ProductCard component but without favorite functionality
 */
const ProductCardSimple: React.FC<{
  product: ProductBusinessSetupSchemaAPIType;
  projectName: string;
  currency: string;
  onClick: () => void;
  isExpanded: boolean;
  cardWidth?: number;
}> = ({ product, currency, onClick, isExpanded, cardWidth }) => {
  const images = product.media || [];

  const appliedWidth = cardWidth ? `${cardWidth}px` : 'calc(50% - 1px)';

  return (
    <div
      onClick={onClick}
      className={`aspect-9/10 cursor-pointer relative overflow-hidden flex justify-end flex-col items-center transition-opacity hover:opacity-90 ${
        isExpanded ? 'ring-2 ring-blue-500' : ''
      }`}
      style={{ width: appliedWidth }}
    >
      <Image
        src={ProductBGImg}
        alt=""
        width={0}
        height={0}
        sizes="100vw"
        className="absolute top-0 w-full h-full object-cover"
        unoptimized
      />

      <div className="z-0 flex-1 top-0 absolute w-full h-full shrink-0 flex items-center justify-center overflow-hidden">
        <div className="flex transition-transform duration-300 ease-in-out w-full h-full">
          {images.map((image, index) =>
            index === 0 ? (
              <Image
                key={index}
                className="w-full h-full object-cover object-center shrink-0"
                src={image.url || ''}
                alt={product.name}
                width={0}
                height={0}
                sizes="100vw"
                unoptimized
              />
            ) : (
              <React.Fragment key={index}></React.Fragment>
            )
          )}
        </div>
      </div>

      <div className="z-0 absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90"></div>

      <div className="relative w-full flex flex-col p-4 lg:p-4 shrink-0 text-sm">
        <div className="w-full flex flex-col">
          <div className="truncate font-medium text-white">{product.name}</div>
          <div className="flex items-center shrink-0">
            <div className="whitespace-pre text-gray-300">{`$ ${formatCurrency(product.price.toString())} `}</div>
            <div className="text-gray-300">{currency.toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Product images row component
 * Displays all available images for a selected product in a horizontal layout
 * with image selection and send button
 */
const ProductImagesRow: React.FC<{
  product: ProductBusinessSetupSchemaAPIType;
  selectedImageId: string | null;
  onImageSelect: (imageId: string) => void;
  onSendProductCard: () => void;
  onClose: () => void;
}> = ({ product, selectedImageId, onImageSelect, onSendProductCard, onClose }) => {
  const t = useTranslations('messages');
  const images = useMemo(() => product.media || [], [product.media]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Measure container width on mount and resize
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateContainerWidth();

    const resizeObserver = new ResizeObserver(updateContainerWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate image size and layout based on number of images
  const { imageSize, imageRows } = useMemo(() => {
    const totalImages = images.length;

    // Return default values if no images (will be used with early return below)
    if (totalImages === 0) {
      return {
        imageSize: 0,
        imageRows: [] as (typeof images)[],
      };
    }

    const minImageSize = 76;
    const gap = 12; // 3 * 4px (gap-3)

    // Special case: if only 1 image, use fixed size of 100px
    if (totalImages === 1) {
      return {
        imageSize: 100,
        imageRows: [images],
      };
    }

    // Determine images per row based on total images
    let imagesPerRow: number;
    if (totalImages <= 3) {
      imagesPerRow = totalImages;
    } else if (totalImages === 4) {
      // Special case: 4 images = 2 rows of 2
      imagesPerRow = 2;
    } else if (totalImages === 5) {
      // 5 images = first row 3, second row 2
      imagesPerRow = 3;
    } else {
      // For 6+ images, use 3 images per row
      imagesPerRow = 3;
    }

    // Calculate available width for images (accounting for gaps)
    const totalGapWidth = (imagesPerRow - 1) * gap;
    const availableWidth = containerWidth - totalGapWidth;

    // Calculate how many images of minimum size can fit
    const maxItemsThatFit = Math.floor((availableWidth + gap) / (minImageSize + gap));

    // Adjust imagesPerRow if container is too small
    const finalImagesPerRow = Math.min(imagesPerRow, Math.max(1, maxItemsThatFit));

    // Calculate final image size (distribute remaining space)
    const finalGapWidth = (finalImagesPerRow - 1) * gap;
    const widthForImages = availableWidth - finalGapWidth + totalGapWidth;
    const calculatedImageSize = Math.floor(widthForImages / finalImagesPerRow);

    // Group images into rows
    const rows: (typeof images)[] = [];
    for (let i = 0; i < totalImages; i += finalImagesPerRow) {
      rows.push(images.slice(i, i + finalImagesPerRow));
    }

    return {
      imageSize: Math.max(minImageSize, calculatedImageSize),
      imageRows: rows,
    };
  }, [images, containerWidth]);

  // If no images, don't render anything (after all hooks have been called)
  if (images.length === 0) return null;

  return (
    <div className="w-full flex-[1_0_100%] bg-gray-50 p-12 border-t border-b border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">{product.name}</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div ref={containerRef} className="flex flex-col items-center gap-3 mb-8">
        {imageRows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-3">
            {row.map((image) => (
              <button
                key={image.id}
                onClick={() => onImageSelect(image.id)}
                className={`relative shrink-0 rounded-md overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                  selectedImageId === image.id
                    ? 'border-blue-500 shadow-lg'
                    : 'border-gray-300 hover:border-blue-300'
                }`}
                style={{
                  width: `${imageSize}px`,
                  height: `${imageSize}px`,
                }}
              >
                <Image
                  src={image.url}
                  alt={image.description}
                  width={0}
                  height={0}
                  sizes="100vw"
                  className="w-full h-full object-cover"
                  unoptimized
                />
                {selectedImageId === image.id && (
                  <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                    <div className="bg-blue-500 rounded-full p-1">
                      <Check size={16} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <Button onClick={onSendProductCard} className="w-full rounded-full">
          {t('Send product card')}
        </Button>
      </div>
    </div>
  );
};

/**
 * Products dialog component
 * Displays business products in a searchable grid
 */
export const ProductsDialog: React.FC<ProductsDialogProps> = ({
  businessInfo,
  businessInfoLoading,
  projectName,
  onClose,
  onSendProductCard,
  onRefresh,
}) => {
  const t = useTranslations('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // State for expanded product and selected images
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [selectedImageMap, setSelectedImageMap] = useState<Record<string, string>>({});

  // Measure container width on mount and resize
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateContainerWidth();

    const resizeObserver = new ResizeObserver(updateContainerWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Get products from business info (memoized to stabilize reference when businessInfo is null)
  const products = useMemo(() => businessInfo?.products?.products || [], [businessInfo?.products?.products]);

  // Get currency based on country code
  const getCurrency = (countryCode?: string): string => {
    if (countryCode === 'COL') return 'COP';
    return 'USD';
  };

  const currency = getCurrency(businessInfo?.info?.countryCode);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((product) => product.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [products, searchQuery]);

  // Calculate card width and items per row based on container width
  const { cardWidth, itemsPerRow } = useMemo(() => {
    // Account for padding: 1px on each side = 2px total
    const availableWidth = containerWidth - 2;

    if (availableWidth > 380) {
      // Minimum card width is 150px
      const minCardWidth = 150;

      // Calculate how many cards fit with 1px gap between them
      // Formula: (minCardWidth + gap) * items - gap <= availableWidth
      // Simplified: (minCardWidth + 1) * items - 1 <= availableWidth
      const maxItems = Math.floor((availableWidth + 1) / (minCardWidth + 1));

      if (maxItems < 1) {
        // Fallback: at least 1 item
        return {
          cardWidth: availableWidth,
          itemsPerRow: 1,
        };
      }

      // Calculate total gap space: (items - 1) gaps of 1px each
      const totalGapWidth = maxItems - 1;

      // Calculate available width for cards (excluding gaps)
      const widthForCards = availableWidth - totalGapWidth;

      // Distribute available width equally among all cards
      // Subtract 1px buffer per card to handle sub-pixel rounding issues
      const calculatedCardWidth = Math.floor(widthForCards / maxItems) - 1;

      return {
        cardWidth: calculatedCardWidth,
        itemsPerRow: maxItems,
      };
    } else {
      // Default: 2 cards per row with dynamic width
      return {
        cardWidth: undefined, // Will use CSS calc(50% - 1px)
        itemsPerRow: 2,
      };
    }
  }, [containerWidth]);

  // Group products into rows based on itemsPerRow
  const productRows = useMemo(() => {
    const rows: ProductBusinessSetupSchemaAPIType[][] = [];
    for (let i = 0; i < filteredProducts.length; i += itemsPerRow) {
      rows.push(filteredProducts.slice(i, i + itemsPerRow));
    }
    return rows;
  }, [filteredProducts, itemsPerRow]);

  // Handle product card click - toggle expansion
  const handleProductClick = (productId: string) => {
    if (expandedProductId === productId) {
      // Clicking the same product collapses it
      setExpandedProductId(null);
    } else {
      // Clicking a different product expands it
      setExpandedProductId(productId);
    }
  };

  // Handle image selection for a product - toggle behavior
  const handleImageSelect = (productId: string, imageId: string) => {
    setSelectedImageMap((prev) => {
      // If clicking the already selected image, unselect it
      if (prev[productId] === imageId) {
        const { [productId]: removed, ...rest } = prev;
        void removed;
        return rest;
      }
      // Otherwise, select the new image
      return {
        ...prev,
        [productId]: imageId,
      };
    });
  };

  // Handle send product card button click
  const handleSendProductCard = (productId: string) => {
    const selectedImageId = selectedImageMap[productId] || null;
    onSendProductCard(productId, selectedImageId);
  };

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="bg-white rounded-md border border-gray-300 shadow-lg h-full flex flex-col overflow-hidden">
      {/* Header with search bar and close button */}
      <div className="flex items-center gap-2 p-4 border-b shrink-0">
        <div className="flex-1 relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Search products...')}
            className="w-full px-3 py-2 pr-10 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          onClick={handleRefresh}
          disabled={isRefreshing || businessInfoLoading}
          className="w-8 h-8 rounded-md shrink-0 p-0"
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
        </Button>

        <Button variant="ghost" onClick={onClose} className="w-8 h-8 rounded-md shrink-0 p-0">
          <X size={20} />
        </Button>
      </div>

      {/* Content area */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {businessInfoLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{t('Loading products...')}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{t('No products available')}</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{t('No products found')}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-[1px] p-[1px]">
            {productRows.map((row, rowIndex) => {
              // Check if any product in this row is expanded
              const expandedProductInRow = row.find((product) => product.id === expandedProductId);

              return (
                <React.Fragment key={`row-${rowIndex}`}>
                  {/* Render the products in this row */}
                  {row.map((product) => (
                    <ProductCardSimple
                      key={product.id}
                      product={product}
                      projectName={projectName}
                      currency={currency}
                      onClick={() => handleProductClick(product.id)}
                      isExpanded={expandedProductId === product.id}
                      cardWidth={cardWidth}
                    />
                  ))}
                  {/* If a product in this row is expanded, show the expandable row */}
                  {expandedProductInRow && (
                    <ProductImagesRow
                      product={expandedProductInRow}
                      selectedImageId={selectedImageMap[expandedProductInRow.id] || null}
                      onImageSelect={(imageId) => handleImageSelect(expandedProductInRow.id, imageId)}
                      onSendProductCard={() => handleSendProductCard(expandedProductInRow.id)}
                      onClose={() => handleProductClick(expandedProductInRow.id)}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
