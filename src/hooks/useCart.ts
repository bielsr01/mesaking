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

let state: { restaurantId: string | null; items: CartItem[] } = {
  restaurantId: null,
  items: [],
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const itemUnitPrice = (i: CartItem) =>
  i.price + (i.options?.reduce((s, o) => s + (Number(o.extraPrice) || 0), 0) ?? 0);

export function useCart() {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );

  return {
    restaurantId: snap.restaurantId,
    items: snap.items,
    total: snap.items.reduce((sum, i) => sum + itemUnitPrice(i) * i.quantity, 0),
    unitPrice: itemUnitPrice,
    add(restaurantId: string, item: CartItem) {
      const optionsKey = (item.options ?? []).map((o) => `${o.groupName}:${o.itemName}`).sort().join("|");
      const enriched = { ...item, optionsKey };
      if (state.restaurantId && state.restaurantId !== restaurantId) {
        state = { restaurantId, items: [enriched] };
      } else {
        const existing = state.items.find(
          (i) => i.productId === item.productId && (i.notes ?? "") === (item.notes ?? "") && (i.optionsKey ?? "") === optionsKey
        );
        if (existing) {
          state = {
            restaurantId,
            items: state.items.map((i) =>
              i === existing ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          };
        } else {
          state = { restaurantId, items: [...state.items, enriched] };
        }
      }
      emit();
    },
    updateQty(productId: string, qty: number, optionsKey?: string) {
      const key = optionsKey ?? "";
      if (qty <= 0) {
        state = { ...state, items: state.items.filter((i) => !(i.productId === productId && (i.optionsKey ?? "") === key)) };
      } else {
        state = { ...state, items: state.items.map((i) => (i.productId === productId && (i.optionsKey ?? "") === key ? { ...i, quantity: qty } : i)) };
      }
      emit();
    },
    remove(productId: string, optionsKey?: string) {
      const key = optionsKey ?? "";
      state = { ...state, items: state.items.filter((i) => !(i.productId === productId && (i.optionsKey ?? "") === key)) };
      emit();
    },
    clear() {
      state = { restaurantId: null, items: [] };
      emit();
    },
  };
}
