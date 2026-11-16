import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Leaf, Mail, Maximize2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import SEO from '@/components/layout/SEO';
import { PayPickupProductFacts } from '@/components/PayPickupProductFacts';

export interface LaunchProduct {
  name: string; type: string; subtitle: string; description: string; slug: string;
  image: string; imageAlt: string; imageCaption?: string;
  additionalImages?: { src: string; alt: string; caption: string }[];
  includes: string[]; benefits: string[]; ingredients: string;
  uses: string; directions?: string; sizes: { label: string; detail: string }[];
  safety?: string; draft?: boolean;
}

/** Information-only product presentation. No catalog registration or invented prices. */
export default function LaunchProductDetail({ product }: { product: LaunchProduct }) {
  const [selected, setSelected] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const images = [{ src: product.image, alt: product.imageAlt, caption: product.imageCaption }, ...(product.additionalImages || [])];
  const activeImage = images[imageIndex] || images[0];
  const size = product.sizes[selected];
  const inquiry = `mailto:info@soilseedandwater.com?subject=${encodeURIComponent(`${product.name} — ${size?.label || 'product information'}`)}&body=${encodeURIComponent(`Hello, I'd like pricing and availability for ${product.name}${size ? ` in the ${size.label} format` : ''}.\n\nQuantity:\nPickup or delivery:\nZIP code:\n`)}`;
  return <>
    <SEO title={`${product.name} — ${product.type}`} description={product.description} canonical={`https://www.organicsoilwholesale.com/products/${product.slug}`} ogImage={`https://www.organicsoilwholesale.com${product.image}`} robots="noindex, follow" />
    <section className="bg-gradient-to-b from-[#eef3eb] via-[#f7f4ef] to-[#f3f6f2] py-4 sm:py-8 lg:py-4" aria-label="Product details">
      <div className="container mx-auto max-w-6xl space-y-5 px-3 sm:px-4 xl:max-w-7xl">
        {product.draft && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Internal preview · Preparing for November 24, 2026 · Pricing, sizes and final usage directions pending confirmation.</p>}
        <div className="overflow-hidden rounded-2xl border border-[#264027]/12 bg-white shadow-[0_10px_40px_-24px_rgba(38,64,39,0.45)] sm:rounded-3xl">
          <div className="border-b border-[#264027]/[0.06] px-4 py-2 lg:px-5"><Link href="/products" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Products</Link></div>
          <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <figure className="bg-gradient-to-br from-[#f4f7f2] via-white to-[#f8f1e7] p-3 sm:p-4 lg:self-start">
              <button type="button" onClick={() => setGalleryOpen(true)} aria-label={`Enlarge ${product.name} image`} className="group relative block h-[310px] w-full rounded-xl bg-white sm:h-[420px] lg:h-[520px]">
                <img src={activeImage.src} alt={activeImage.alt} className="h-full w-full object-contain p-3 sm:p-5" fetchPriority="high" />
                <span className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white"><Maximize2 className="h-4 w-4" /></span>
              </button>
              {images.length > 1 && <div className="mt-3 flex gap-2">{images.map((image, index) => <button key={image.src} type="button" onClick={() => setImageIndex(index)} aria-label={`Show ${image.alt}`} aria-pressed={index === imageIndex} className={`h-20 w-20 overflow-hidden rounded-lg border bg-white p-1 ${index === imageIndex ? "border-[#264027] ring-2 ring-[#264027]/30" : "border-stone-200"}`}><img src={image.src} alt="" className="h-full w-full object-contain" /></button>)}</div>}
              {activeImage.caption && <figcaption className="px-2 pt-3 text-center text-xs leading-relaxed text-muted-foreground">{activeImage.caption}</figcaption>}
            </figure>
            <div className="p-4 sm:p-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#56754c]">{product.type}</p>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{product.name}</h1>
              <p className="mt-1 text-sm font-medium text-[#8b6940]">{product.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{product.description}</p>
              <PayPickupProductFacts includes={product.includes} benefits={product.benefits} variant="detail" className="mt-5" />
              {product.sizes.length > 0 && <fieldset className="mt-6"><legend className="mb-3 font-semibold">Choose a size</legend><div className="grid grid-cols-2 gap-2">{product.sizes.map((option, index) => <label key={option.label} className={`flex min-h-16 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${index === selected ? 'border-[#264027] bg-[#eef3eb] ring-1 ring-[#264027]' : 'border-stone-200 hover:border-[#264027]/50'}`}><input type="radio" name="product-size" value={option.label} checked={index === selected} onChange={() => setSelected(index)} className="mt-1 accent-[#264027]" /><span><strong className="block">{option.label}</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.detail}</span></span></label>)}</div></fieldset>}
              <div className="mt-5 rounded-xl bg-[#f7f4ef] p-4"><p className="text-sm leading-relaxed text-muted-foreground">Contact us for pricing and availability{size ? ` for the ${size.label}` : ''}.</p><Button asChild className="mt-3 min-h-12 w-full rounded-xl bg-[#264027] hover:bg-[#1f3320]"><a href={inquiry}><Mail className="mr-2 h-4 w-4" />Ask about this product</a></Button></div>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Leaf className="h-4 w-4" />Soil Seed &amp; Water · Crafted in Phoenix, Arizona</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl border-[#264027]/10 p-5 sm:p-7"><h2 className="flex items-center gap-2 font-heading text-xl font-bold"><Sprout className="h-5 w-5 text-[#56754c]" />Recommended uses</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{product.uses}</p>{product.directions && <><h2 className="mt-6 font-heading text-xl font-bold">How to use</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{product.directions}</p></>}</Card>
          <Card className="rounded-2xl border-[#264027]/10 p-5 sm:p-7"><h2 className="font-heading text-xl font-bold">Ingredients</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{product.ingredients}</p>{product.safety && <><h3 className="mt-6 font-semibold">Handling &amp; safety</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{product.safety}</p></>}</Card>
        </div>
      </div>
    </section>
    <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}><DialogContent className="max-h-[95dvh] max-w-3xl overflow-y-auto"><DialogTitle>{product.name}</DialogTitle><DialogDescription>{activeImage.caption || activeImage.alt}</DialogDescription><img src={activeImage.src} alt={activeImage.alt} className="max-h-[70dvh] w-full object-contain" /></DialogContent></Dialog>
  </>;
}
