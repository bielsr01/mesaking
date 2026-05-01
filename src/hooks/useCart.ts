import { useSyncExternalStore } from "react";

export interface CartItemOption {
  groupName: string;
  itemName: string;
  extraPrice: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number; // base price
  quantity: number;
  notes?: string;
  options?: CartItemOption[];
  /** unique key to dedupe items with same product + same options + same notes */
  optionsKey?: string;
}

interface CartState {
  restaurantId: string | null;
  items: CartItem[];
}

let state: CartState = { restaurantId: null, items: [] };
const listeners = new Set<() => void>();

const setState = (next: CartState) => {
  state = next;
  // Notify all subscribers synchronously — copy to array to avoid mutation during iteration
  Array.from(listeners).forEach((l) => l());
};

const getSnapshot = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const itemUnitPrice = (i: CartItem) =>
  i.price + (i.options?.reduce((s, o) => s + (Number(o.extraPrice) || 0), 0) ?? 0);

// Stable action functions — defined once, mutate module state
const add = (restaurantId: string, item: CartItem) => {
  const optionsKey = (item.options ?? [])
    .map((o) => `${o.groupName}:${o.itemName}`)
    .sort()
    .join("|");
  const enriched = { ...item, optionsKey };
  if (state.restaurantId && state.restaurantId !== restaurantId) {
    setState({ restaurantId, items: [enriched] });
    return;
  }
  const existing = state.items.find(
    (i) =>
      i.productId === item.productId &&
      (i.notes ?? "") === (item.notes ?? "") &&
      (i.optionsKey ?? "") === optionsKey
  );
  if (existing) {
    setState({
      restaurantId,
      items: state.items.map((i) =>
        i === existing ? { ...i, quantity: i.quantity + item.quantity } : i
      ),
    });
  } else {
    setState({ restaurantId, items: [...state.items, enriched] });
  }
};

const updateQty = (productId: string, qty: number, optionsKey?: string) => {
  const key = optionsKey ?? "";
  if (qty <= 0) {
    setState({
      ...state,
      items: state.items.filter(
        (i) => !(i.productId === productId && (i.optionsKey ?? "") === key)
      ),
    });
  } else {
    setState({
      ...state,
      items: state.items.map((i) =>
        i.productId === productId && (i.optionsKey ?? "") === key
          ? { ...i, quantity: qty }
          : i
      ),
    });
  }
};

const remove = (productId: string, optionsKey?: string) => {
  const key = optionsKey ?? "";
  setState({
    ...state,
    items: state.items.filter(
      (i) => !(i.productId === productId && (i.optionsKey ?? "") === key)
    ),
  });
};

const clear = () => setState({ restaurantId: null, items: [] });

export function useCart() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    restaurantId: snap.restaurantId,
    items: snap.items,
    total: snap.items.reduce((sum, i) => sum + itemUnitPrice(i) * i.quantity, 0),
    unitPrice: itemUnitPrice,
    add,
    updateQty,
    remove,
    clear,
  };
}
