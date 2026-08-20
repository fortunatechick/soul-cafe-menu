'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'soulmenu_cart';

const CartContext = createContext(null);

/**
 * A cart line is keyed by item + chosen variation, so "Latte · Large" and
 * "Latte · Regular" live as two independent lines.
 */
export function lineKey(itemId, variation) {
  return `${itemId}::${variation || ''}`;
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setLines(JSON.parse(saved));
    } catch {
      // corrupt payload — start clean
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage full or blocked — cart simply won't survive a reload
    }
  }, [lines, hydrated]);

  function addItem(item, variation = null, quantity = 1) {
    const key = lineKey(item.id, variation?.name);
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [
        ...prev,
        {
          key,
          id: item.id,
          name: item.name,
          slug: item.slug,
          posShortCode: item.posShortCode || '',
          deliveryAvailable: item.deliveryAvailable !== false,
          variation: variation?.name || null,
          unitPrice: variation?.price ?? item.price,
          quantity,
        },
      ];
    });
  }

  function removeItem(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateQuantity(key, quantity) {
    if (quantity <= 0) return removeItem(key);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  function clearCart() {
    setLines([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  /** Total quantity of one menu item across all of its variations. */
  function quantityOfItem(itemId) {
    return lines.reduce((n, l) => (l.id === itemId ? n + l.quantity : n), 0);
  }

  const totalItems = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0),
    [lines]
  );

  const value = {
    lines,
    hydrated,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    quantityOfItem,
    totalItems,
    subtotal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
