/**
 * Hook stubs — placeholder hooks for features not yet migrated
 * (orders, shopping cart).
 */
import type { Cart, CartItem } from '@/app/types/cart';
import type { Order } from '@/app/types/orders';
import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// useOrders
// ---------------------------------------------------------------------------

interface UseOrdersReturn {
  orders: Order[];
  loading: boolean;
  refreshOrders: () => Promise<void>;
}

export const useOrders = (_projectName: string, _userID: string): UseOrdersReturn => {
  const [orders] = useState<Order[]>([]);
  const [loading] = useState(false);

  const refreshOrders = useCallback(async (): Promise<void> => {
    /* no-op stub */
  }, []);

  return { orders, loading, refreshOrders };
};

// ---------------------------------------------------------------------------
// useShoppingCart
// ---------------------------------------------------------------------------

interface UseShoppingCartReturn {
  cart: Cart | null;
  loading: boolean;
  refreshCart: () => Promise<void>;
  addItem: (item: CartItem) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

export const useShoppingCart = (_projectName: string, _userID: string): UseShoppingCartReturn => {
  const [cart] = useState<Cart | null>(null);
  const [loading] = useState(false);

  const refreshCart = useCallback(async (): Promise<void> => {
    /* no-op stub */
  }, []);

  const addItem = useCallback(async (_item: CartItem): Promise<void> => {
    /* no-op stub */
  }, []);

  const removeItem = useCallback(async (_itemId: string): Promise<void> => {
    /* no-op stub */
  }, []);

  return { cart, loading, refreshCart, addItem, removeItem };
};
