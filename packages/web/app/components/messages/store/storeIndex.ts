import { type PayloadAction, createSlice } from '@reduxjs/toolkit';
import { type StateType } from '@store/index';

import { ProductBusinessSetupSchemaAPIType } from '@globalTypes/business';

export const StorePath = 'store';

export interface CartPersonalization {
  type: string;
  value: string;
}

export interface StoreProduct {
  quantity: number;
  item: ProductBusinessSetupSchemaAPIType;
  selectedPersonalizations: CartPersonalization[];
}

const getPersonalizationsKey = (personalizations: CartPersonalization[]): string => {
  return [...personalizations]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((p) => `${p.type}:${p.value}`)
    .join('|');
};

const findCartItem = (
  cart: StoreProduct[],
  productId: string,
  personalizations: CartPersonalization[]
): StoreProduct | undefined => {
  const personalizationsKey = getPersonalizationsKey(personalizations);
  return cart.find(
    (cartItem) =>
      cartItem.item.id === productId &&
      getPersonalizationsKey(cartItem.selectedPersonalizations || []) === personalizationsKey
  );
};

interface InitialStoreState {
  carts: Record<string, StoreProduct[]>;
}

const cachedData: { carts: string[] } = JSON.parse(
  window.localStorage.getItem('store-carts') || '{"carts": []}'
);

const cachedCart: Record<string, StoreProduct[]> = {};
cachedData.carts.forEach((namespace) => {
  const data = window.localStorage.getItem(`store-cart-${namespace}`);
  if (data && data.length > 0) cachedCart[namespace] = JSON.parse(data);
});

const initialData: InitialStoreState = {
  carts: cachedCart,
};

export const StoreSlice = createSlice({
  name: StorePath,
  initialState: initialData,
  reducers: {
    addItemToCart: (
      state,
      action: PayloadAction<{
        namespace: string;
        product: ProductBusinessSetupSchemaAPIType;
        personalizations: CartPersonalization[];
      }>
    ) => {
      const { namespace, product, personalizations } = action.payload;
      const cart = state.carts[namespace];
      if (cart) {
        const alreadyInCart = findCartItem(cart, product.id, personalizations);
        if (alreadyInCart) {
          alreadyInCart.quantity++;
        } else {
          cart.push({
            quantity: 1,
            item: product,
            selectedPersonalizations: personalizations,
          });
        }
      } else {
        state.carts[namespace] = [
          {
            quantity: 1,
            item: product,
            selectedPersonalizations: personalizations,
          },
        ];
      }

      const json = JSON.stringify(state.carts[namespace]);
      window.localStorage.setItem(`store-cart-${namespace}`, json);
      const carts: { carts: string[] } = JSON.parse(
        window.localStorage.getItem('store-carts') || '{"carts": []}'
      );
      carts.carts = [...new Set([...carts.carts, namespace])];
      window.localStorage.setItem('store-carts', JSON.stringify(carts));
    },
    removeItemFromCart: (
      state,
      action: PayloadAction<{
        namespace: string;
        productId: string;
        personalizations: CartPersonalization[];
      }>
    ) => {
      const { namespace, productId, personalizations } = action.payload;
      const cart = state.carts[namespace];
      if (!cart) return;

      const personalizationsKey = getPersonalizationsKey(personalizations);
      const itemIndex = cart.findIndex(
        (cartItem) =>
          cartItem.item.id === productId &&
          getPersonalizationsKey(cartItem.selectedPersonalizations || []) === personalizationsKey
      );
      if (itemIndex !== -1) {
        cart.splice(itemIndex, 1);
      }

      const json = JSON.stringify(state.carts[namespace]);
      window.localStorage.setItem(`store-cart-${namespace}`, json);
    },
    updateCartItemQuantity: (
      state,
      action: PayloadAction<{
        namespace: string;
        productId: string;
        personalizations: CartPersonalization[];
        quantity: number;
      }>
    ) => {
      const { namespace, productId, personalizations, quantity } = action.payload;
      const cart = state.carts[namespace];
      if (!cart) return;

      const item = findCartItem(cart, productId, personalizations);
      if (item) {
        if (quantity <= 0) {
          const itemIndex = cart.indexOf(item);
          cart.splice(itemIndex, 1);
        } else {
          item.quantity = quantity;
        }
      }

      const json = JSON.stringify(state.carts[namespace]);
      window.localStorage.setItem(`store-cart-${namespace}`, json);
    },
    clearCart: (
      state,
      action: PayloadAction<{
        namespace: string;
      }>
    ) => {
      const { namespace } = action.payload;
      // Clear cart in state
      state.carts[namespace] = [];

      // Clear cart from localStorage
      window.localStorage.removeItem(`store-cart-${namespace}`);

      // Update the carts list in localStorage
      const cartsData: { carts: string[] } = JSON.parse(
        window.localStorage.getItem('store-carts') || '{"carts": []}'
      );
      cartsData.carts = cartsData.carts.filter((ns) => ns !== namespace);
      window.localStorage.setItem('store-carts', JSON.stringify(cartsData));
    },
  },
});

export const getCart = (state: StateType, namespace: string) => state[StorePath].carts[namespace];

export const getCartTotal = (state: StateType, namespace: string): number => {
  const cart = state[StorePath].carts[namespace] || [];
  return cart.reduce((total, item) => total + item.item.price * item.quantity, 0);
};

export const getCartItemCount = (state: StateType, namespace: string): number => {
  const cart = state[StorePath].carts[namespace] || [];
  return cart.reduce((total, item) => total + item.quantity, 0);
};

export const { addItemToCart, removeItemFromCart, updateCartItemQuantity, clearCart } = StoreSlice.actions;

export const StoreReducer = StoreSlice.reducer;
