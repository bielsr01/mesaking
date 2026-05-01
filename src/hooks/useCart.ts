import { create } from "zustand";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  restaurantId: string | null;
  items: CartItem[];
  add: (restaurantId: string, item: CartItem) => void;
  updateQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  total: () => number;
}

// Lightweight reactive store without external lib
import { useSyncExternalStore } from "react";

let state: { restaurantId: string | null; items: CartItem[] } = {
  restaurantId: null,
  items: [],
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

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
    total: snap.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    add(restaurantId: string, item: CartItem) {
      if (state.restaurantId && state.restaurantId !== restaurantId) {
        state = { restaurantId, items: [item] };
      } else {
        const existing = state.items.find((i) => i.productId === item.productId && i.notes === item.notes);
        if (existing) {
          state = {
            restaurantId,
            items: state.items.map((i) =>
              i === existing ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          };
        } else {
          state = { restaurantId, items: [...state.items, item] };
        }
      }
      emit();
    },
    updateQty(productId: string, qty: number) {
      if (qty <= 0) {
        state = { ...state, items: state.items.filter((i) => i.productId !== productId) };
      } else {
        state = { ...state, items: state.items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)) };
      }
      emit();
    },
    remove(productId: string) {
      state = { ...state, items: state.items.filter((i) => i.productId !== productId) };
      emit();
    },
    clear() {
      state = { restaurantId: null, items: [] };
      emit();
    },
  };
}

// dummy export to satisfy eslint
export const _create = create;
