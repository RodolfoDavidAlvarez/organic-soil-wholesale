import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { cartItemToEcommerceItem, trackEcommerceEvent, trackEvent } from "@/lib/analytics";
import {
  cartFlatbedSpots,
  fullLoadDiscountAmount,
  hasFullFlatbedDiscount,
} from "@/lib/flatbedSpots";
import { normalizeV5CartItem } from "@shared/oswPricing.js";

export type CartItem = {
  productId: number;
  productName: string;
  productSlug: string;
  format: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  /** 'pay' = pay-now via Stripe at pickup slot · 'quote' = request a quote */
  mode?: 'pay' | 'quote';
  /** Thumbnail for cart drawer line item — the product bag photo */
  imageUrl?: string;
  /** Optional size category photo (e.g., 9lb-bag, pallet, super sack) shown as an
   *  overlay badge on top of imageUrl so the customer sees what size they picked */
  sizeImage?: string;
  /** V5 bag-by-quantity list price for a discounted pallet. */
  listUnitPrice?: number;
  savingsPerUnit?: number;
  discountPercent?: number;
  unitsPerPallet?: number | null;
};

type QuoteCartContextValue = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: number, format: string) => void;
  updateQuantity: (productId: number, format: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  /** Flatbed spots across all cart lines (pallets / totes / 22-pallet truckloads). */
  flatbedSpots: number;
  /** True when spots === 22 (full single flatbed → 10% product discount). */
  hasFullFlatbedDiscount: boolean;
  /** Dollar amount of the full-flatbed product discount (0 if not full). */
  fullFlatbedDiscountAmount: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const STORAGE_KEY = "osw-quote-cart";

const loadCart = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((item) => normalizeV5CartItem(item) as CartItem) : [];
  } catch {
    return [];
  }
};

const saveCart = (items: CartItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* quota exceeded — ignore */ }
};

const QuoteCartContext = createContext<QuoteCartContextValue | null>(null);

export const QuoteCartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = useCallback((newItem: CartItem) => {
    const canonicalItem = normalizeV5CartItem(newItem) as CartItem;
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.productId === canonicalItem.productId && i.format === canonicalItem.format
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...canonicalItem, quantity: updated[idx].quantity + canonicalItem.quantity };
        return updated;
      }
      return [...prev, canonicalItem];
    });
    trackEvent("Cart Item Added", {
      product_id: canonicalItem.productId,
      product_slug: canonicalItem.productSlug,
      format: canonicalItem.format,
      quantity: canonicalItem.quantity,
      unit_price: canonicalItem.unitPrice,
      mode: canonicalItem.mode ?? "quote",
    });
    trackEcommerceEvent("add_to_cart", {
      value: canonicalItem.unitPrice * canonicalItem.quantity,
      items: [cartItemToEcommerceItem(canonicalItem)],
      mode: canonicalItem.mode ?? "quote",
      pickup_sales_channel: "osw_yard",
    });
  }, []);

  const removeItem = useCallback((productId: number, format: string) => {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.format === format)));
    trackEvent("Cart Item Removed", { product_id: productId, format });
  }, []);

  const updateQuantity = useCallback((productId: number, format: string, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.format === format ? { ...i, quantity } : i
      )
    );
    trackEvent("Cart Quantity Updated", { product_id: productId, format, quantity });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    trackEvent("Cart Cleared");
  }, []);

  const totalItems = useMemo(() => items.reduce((count, item) => count + item.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [items]);
  const flatbedSpots = useMemo(() => cartFlatbedSpots(items), [items]);
  const fullFlatbedDiscount = useMemo(() => hasFullFlatbedDiscount(flatbedSpots), [flatbedSpots]);
  const fullFlatbedDiscountAmount = useMemo(() => fullLoadDiscountAmount(items), [items]);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    trackEvent("Cart Opened", { total_items: items.length });
  }, [items.length]);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  return (
    <QuoteCartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        flatbedSpots,
        hasFullFlatbedDiscount: fullFlatbedDiscount,
        fullFlatbedDiscountAmount,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </QuoteCartContext.Provider>
  );
};

export const useQuoteCart = () => {
  const ctx = useContext(QuoteCartContext);
  if (!ctx) throw new Error("useQuoteCart must be used within QuoteCartProvider");
  return ctx;
};
