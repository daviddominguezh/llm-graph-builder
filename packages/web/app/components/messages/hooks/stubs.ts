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

export const useOrders = (projectName: string, userID: string): UseOrdersReturn => {
  void projectName;
  void userID;

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

export const useShoppingCart = (projectName: string, userID: string): UseShoppingCartReturn => {
  void projectName;
  void userID;

  const [cart] = useState<Cart | null>(null);
  const [loading] = useState(false);

  const refreshCart = useCallback(async (): Promise<void> => {
    /* no-op stub */
  }, []);

  const addItem = useCallback(async (item: CartItem): Promise<void> => {
    void item;
    /* no-op stub */
  }, []);

  const removeItem = useCallback(async (itemId: string): Promise<void> => {
    void itemId;
    /* no-op stub */
  }, []);

  return { cart, loading, refreshCart, addItem, removeItem };
};
