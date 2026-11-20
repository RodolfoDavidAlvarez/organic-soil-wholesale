import { Link } from "wouter";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { PromoBundle } from "@shared/promoBundles.js";
import { bundleGroupImages } from "@/data/bundlePresentation";
import { OptimizedImage } from "@/components/OptimizedImage";

type Props = {
  bundle: PromoBundle;
  quantity: number;
  priceLabel?: string;
  onOpen?: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
};

export function BundleCartLine({ bundle, quantity, priceLabel, onOpen, onQuantity, onRemove }: Props) {
  const totalBags = quantity * bundle.items.reduce((sum, item) => sum + item.bagCount, 0);
  return (
    <article className="min-w-0">
      <Link href={`/offers/${bundle.slug}`} onClick={onOpen} aria-label={`View ${bundle.title}`} className="block rounded-xl focus-visible:ring-2">
        <OptimizedImage
          src={bundleGroupImages[bundle.slug]}
          alt={`Bagged products in the ${bundle.title} bundle`}
          width={640}
          q={75}
          className="h-40 w-full rounded-xl bg-white object-contain sm:h-44"
        />
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-semibold leading-tight tracking-tight text-stone-950">{bundle.title}</h3>
          {priceLabel && <span className="text-sm font-semibold tabular-nums">{priceLabel}</span>}
        </div>
      </Link>
      <p className="mt-1 text-sm text-stone-600">{quantity} {quantity === 1 ? "bundle" : "bundles"} · {totalBags} bags total</p>
      <ul aria-label="Included in this order" className="mt-3 space-y-1">
        {bundle.items.map((item) => (
          <li key={item.name} className="flex items-baseline justify-between gap-3 text-sm leading-snug">
            <span className="text-stone-700">{item.name}</span>
            <span className="shrink-0 font-medium tabular-nums text-stone-900">{item.bagCount * quantity} bags</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-full border border-stone-200">
          <button type="button" aria-label={`Decrease quantity of ${bundle.title}`} disabled={quantity <= 1} onClick={() => onQuantity(quantity - 1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-stone-50 disabled:opacity-35">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <button type="button" aria-label={`Increase quantity of ${bundle.title}`} onClick={() => onQuantity(quantity + 1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-stone-50">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" aria-label={`Remove ${bundle.title}`} onClick={onRemove} className="grid h-11 w-11 place-items-center rounded-full text-stone-500 hover:bg-red-50 hover:text-red-700">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
