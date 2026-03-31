export interface CartItem {
  id: string;
  quantity: number;
  personalizations?: Array<{ type: string; value: string }> | null;
}

// Cart is now a dictionary/object with itemId as keys
export interface Cart {
  [itemId: string]: CartItem;
}

export interface CachedShoppingCart {
  data: Cart;
  timestamp: number;
  projectName: string;
}

export interface CartAPIResponse {
  cart: Cart;
}
