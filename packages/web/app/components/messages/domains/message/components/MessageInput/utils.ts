import { BusinessSetup, Product } from '@/app/components/messages/shared/stubs';
import { formatCurrency } from '@/app/components/messages/shared/utilStubs';

// TODO: This is required for other than nike
const MAP_PERSONALIZATION_TYPE_TO_EMOJI: Record<string, string> = {
  'Talla Guantes': '🧤',
  Color: '🌈',
  'Talla Calzado': '👟',
  'Talla Ropa': '👕',
  Material: '🧶',
};

interface FilteredPersonalization {
  type: string;
  values: string[];
}

/**
 * Get personalizations filtered by the selected image and stock availability
 * If an image is selected, only show personalizations that apply to that image based on stock
 */
const getFilteredPersonalizations = (
  product: Product,
  selectedImageId?: string,
  businessSetup?: BusinessSetup
): FilteredPersonalization[] => {
  // If no image selected, return all personalizations
  if (!selectedImageId || !product.media) {
    return (product.personalizations || []).map((p) => ({
      type: p.type,
      values: p.values,
    }));
  }

  // Find the selected media
  const selectedMedia = product.media.find((m) => m.id === selectedImageId);

  if (!selectedMedia) {
    return (product.personalizations || []).map((p) => ({
      type: p.type,
      values: p.values,
    }));
  }

  // If the media has no personalizations defined, show all
  if (!selectedMedia.personalizations || selectedMedia.personalizations.length === 0) {
    return (product.personalizations || []).map((p) => ({
      type: p.type,
      values: p.values,
    }));
  }

  // STOCK-BASED FILTERING (only when image is selected)
  // Find the stock item for this product
  const stockItem = businessSetup?.stock?.stock?.find((s) => s.id === product.id);

  // If no stock item found, everything is available
  if (!stockItem) {
    return (product.personalizations || []).map((p) => ({
      type: p.type,
      values: p.values,
    }));
  }

  // Get the personalizations from the selected media (these are the known values, e.g., Color: Rojo)
  const knownPersonalizations = selectedMedia.personalizations.map((p) => ({
    type: p.type.trim(),
    values: p.values.map((v) => v.trim()),
  }));

  // Filter stock combinations that match ALL known personalizations and are available
  const matchingCombinations = stockItem.personalizations.filter((combination) => {
    // Check if available (default to true if not specified)
    const isAvailable = combination.available !== false;

    if (!isAvailable) {
      return false;
    }

    // Check stock availability based on withStock flag
    // - If withStock is false or undefined: infinite stock (always available)
    // - If withStock is true: check if stock > 0
    const withStock = combination.withStock ?? false;
    const hasStock = withStock ? combination.stock > 0 : true;

    if (!hasStock) {
      return false;
    }

    // Check if this combination matches ALL known personalizations from the image
    const options = combination.options || [];

    return knownPersonalizations.every((knownPers) => {
      // Find the option in this combination for this personalization type
      const option = options.find((opt) => opt.type.trim() === knownPers.type);

      // If not found in this combination, it doesn't match
      if (!option) {
        return false;
      }

      // Check if the value matches any of the known values
      return knownPers.values.some((knownValue) => option.value.trim() === knownValue);
    });
  });

  // Extract all unique personalization values from matching combinations
  const availablePersonalizationValues = new Map<string, Set<string>>();

  for (const combination of matchingCombinations) {
    const options = combination.options || [];

    for (const option of options) {
      const type = option.type.trim();
      const value = option.value.trim();

      if (!availablePersonalizationValues.has(type)) {
        availablePersonalizationValues.set(type, new Set());
      }

      const typeSet = availablePersonalizationValues.get(type);
      if (typeSet) {
        typeSet.add(value);
      }
    }
  }

  // ALSO check for infinite stock combinations that MATCH the known personalizations
  // If a combination has withStock=false (infinite stock), it's always available regardless of stock number
  const infiniteStockCombinations = stockItem.personalizations.filter((combination) => {
    const withStock = combination.withStock ?? false;
    const isAvailable = combination.available !== false;

    // Only consider combinations with infinite stock (withStock=false) and available
    if (withStock || !isAvailable) {
      return false;
    }

    // Check if this combination matches ALL known personalizations from the image
    const options = combination.options || [];

    return knownPersonalizations.every((knownPers) => {
      const option = options.find((opt) => opt.type.trim() === knownPers.type);
      if (!option) {
        return false;
      }
      return knownPers.values.some((knownValue) => option.value.trim() === knownValue);
    });
  });

  // Add values from infinite stock combinations
  for (const combination of infiniteStockCombinations) {
    const options = combination.options || [];

    for (const option of options) {
      const type = option.type.trim();
      const value = option.value.trim();

      if (!availablePersonalizationValues.has(type)) {
        availablePersonalizationValues.set(type, new Set());
      }

      const typeSet = availablePersonalizationValues.get(type);
      if (typeSet) {
        typeSet.add(value);
      }
    }
  }

  // Build the filtered personalizations based on available values
  const filtered: FilteredPersonalization[] = [];

  for (const productPersonalization of product.personalizations || []) {
    const type = productPersonalization.type.trim();
    const availableValues = availablePersonalizationValues.get(type);

    if (availableValues && availableValues.size > 0) {
      // Only include values that are available in matching combinations
      const filteredValues = productPersonalization.values.filter((value) =>
        availableValues.has(value.trim())
      );

      if (filteredValues.length > 0) {
        filtered.push({
          type: productPersonalization.type,
          values: filteredValues,
        });
      }
    }
  }

  return filtered;
};

const generatePersonalizationsStr = (
  product: Product,
  selectedImageId?: string,
  businessSetup?: BusinessSetup
): string => {
  const personalizations = getFilteredPersonalizations(product, selectedImageId, businessSetup);

  if (personalizations.length === 0) {
    return '';
  }

  return personalizations
    .map((personalization) => {
      return `
${MAP_PERSONALIZATION_TYPE_TO_EMOJI[personalization.type.trim()] || '📏'} *${personalization.type.trim()}:* ${personalization.values.map((val) => val.trim()).join(', ')}.
    `.trim();
    })
    .join('\n')
    .trim();
};

/**
 * Calculate the price for a product based on selected image personalizations
 * Priority: 1. Product-specific combination pricing, 2. Global personalization pricing, 3. Base price
 */
const calculateProductPrice = (
  product: Product,
  selectedImageId?: string,
  businessSetup?: BusinessSetup
): number => {
  // If no image selected, return base price
  if (!selectedImageId || !product.media) {
    return product.price;
  }

  // Find the selected media
  const selectedMedia = product.media.find((m) => m.id === selectedImageId);

  if (!selectedMedia || !selectedMedia.personalizations || selectedMedia.personalizations.length === 0) {
    return product.price;
  }

  // Get the personalizations from the selected media
  const imagePersonalizations = selectedMedia.personalizations.map((p) => ({
    type: p.type.trim(),
    values: p.values.map((v) => v.trim()),
  }));

  // PRIORITY 1: Check product-specific combination pricing
  if (product.personalizationCombinationPricing && product.personalizationCombinationPricing.length > 0) {
    for (const pricingCombo of product.personalizationCombinationPricing) {
      const comboOptions = pricingCombo.combination;

      // Get unique personalization types from the combination
      const comboTypes = new Set(comboOptions.map((opt) => opt.type.trim()));
      const imageTypes = new Set(imagePersonalizations.map((p) => p.type));

      // First check: combination must have the same number of personalization types as the image
      if (comboTypes.size !== imageTypes.size) {
        continue;
      }

      // Second check: all types must match
      const allTypesMatch = Array.from(imageTypes).every((type) => comboTypes.has(type));
      if (!allTypesMatch) {
        continue;
      }

      // Third check: all values for each type must match
      const allValuesMatch = imagePersonalizations.every((imagePers) => {
        // Find if any value from this personalization type matches in the combination
        return imagePers.values.some((imageValue) => {
          return comboOptions.some(
            (option) => option.type.trim() === imagePers.type && option.value.trim() === imageValue
          );
        });
      });

      if (allValuesMatch) {
        return pricingCombo.customPrice;
      }
    }
  }

  // PRIORITY 2: Check global personalizations pricing
  const globalPersonalizations = businessSetup?.personalizations?.personalizations;

  if (globalPersonalizations && globalPersonalizations.length > 0) {
    let totalPrice = product.price;
    let hasGlobalPricing = false;

    // For each personalization in the image, add the global addedPrice
    for (const imagePers of imagePersonalizations) {
      const globalPers = globalPersonalizations.find((gp) => gp.type.trim() === imagePers.type);

      if (globalPers) {
        // For each value in the image personalization, find the matching global value and add its price
        for (const imageValue of imagePers.values) {
          const matchingValue = globalPers.values.find((v) => v.value.trim() === imageValue);

          if (matchingValue && matchingValue.addedPrice > 0) {
            totalPrice += matchingValue.addedPrice;
            hasGlobalPricing = true;
          }
        }
      }
    }

    if (hasGlobalPricing) {
      return totalPrice;
    }
  }

  return product.price;
};

const createProductCardStr = (
  product: Product,
  selectedImageId?: string,
  businessSetup?: BusinessSetup
): string => {
  const personalizationsStr = generatePersonalizationsStr(product, selectedImageId, businessSetup);
  const price = calculateProductPrice(product, selectedImageId, businessSetup);

  return `*🛍️${'  ' + product.name.trim()}*\n💵 *Precio:* desde $${formatCurrency(price.toString())}
${personalizationsStr}
  `.trim();
};

export const createProductCardsStr = (
  prod: Product,
  selectedImage?: string,
  businessSetup?: BusinessSetup
): string => {
  return createProductCardStr(prod, selectedImage, businessSetup);
};
