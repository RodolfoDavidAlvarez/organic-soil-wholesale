import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckCircle2, MapPin, PackageCheck, Phone, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useQuoteCart } from "@/contexts/QuoteCartContext";
import { trackEvent, trackEcommerceEvent } from "@/lib/analytics";
import { completeLeadSuccess, LeadSubmissionRequestError, submitLeadPayload } from "@/lib/leadSubmissionClient";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { HOURS_LABEL } from "@shared/pickupSchedule.js";

const fmt = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface LeadInfo {
  name: string;
  email: string;
  phone: string;
  customer_category: string;
  company: string;
  notes: string;
  preferred_date: string;
}

type ProductFormat = { key: string; label: string };
type ProductOption = { id: number; label: string; slug: string; image: string; formats: ProductFormat[] };
type ProductRow = { id: string; productId: string; format: string; quantity: number };
type Fulfillment = "pickup" | "delivery" | "not-sure";

const PRODUCT_PHOTO_BY_SLUG: Record<string, string> = {
  "simons-gold": "/images/quote-products/simons-gold.webp",
  "mikeys-worm-poop": "/images/quote-products/mikeys-worm-poop.webp",
  plantpal: "/images/quote-products/plantpal.webp",
  "natures-blanket": "/images/quote-products/natures-blanket.webp",
  "natures-blanket-premium": "/images/quote-products/natures-blanket-premium.webp",
  "amazonian-dark-earth": "/images/quote-products/amazonian-dark-earth.webp",
  "artemis-root-boost-blend": "/images/quote-products/artemis-root-boost-blend.webp",
  "tee-top-divot-repair-blend": "/images/quote-products/tee-top-divot-repair-blend.webp",
  "turf-daddy-blend": "/images/quote-products/turf-daddy-blend.webp",
  "oasis-blend": "/images/quote-products/oasis-blend.webp",
  "bacchus-blend": "/images/quote-products/bacchus-blend.webp",
  "seriokais-secret-blend": "/images/quote-products/seriokais-secret-blend.webp",
  "pomona-blend": "/images/quote-products/pomona-blend.webp",
  "stoned-apes-blend": "/images/quote-products/stoned-apes-blend.webp",
  "desert-defender": "/images/quote-products/desert-defender.webp",
  zeolite: "/images/quote-products/zeolite.webp",
  skmicrosource: "/images/quote-products/skmicrosource.webp",
  superbooster: "/images/quote-products/superbooster.webp",
  "cultivators-rose-blend": "/images/quote-products/cultivators-rose-blend.webp",
  plugboost: "/images/quote-products/plugboost.webp",
  propagrow: "/images/quote-products/propagrow.webp",
};

const FALLBACK_PRODUCTS: ProductOption[] = [
  { id: 111, label: "PlantPal Plus", slug: "plantpal", image: PRODUCT_PHOTO_BY_SLUG.plantpal, formats: ["1.5CF Bag", "Pallet (30 x 1.5CF)", "Tote", "Truckload (~60 cu yd)"].map((label) => ({ key: label, label })) },
  { id: 1000, label: "Simon's Gold", slug: "simons-gold", image: PRODUCT_PHOTO_BY_SLUG["simons-gold"], formats: ["9lb Bag", "Pallet (144 x 9lb)", "1CF Bag", "Pallet (50 x 1CF)", "Tote", "Bulk Pickup", "Truckload (~24 tons)"].map((label) => ({ key: label, label })) },
  { id: 1001, label: "Mikey's Worm Poop", slug: "mikeys-worm-poop", image: PRODUCT_PHOTO_BY_SLUG["mikeys-worm-poop"], formats: ["9lb Bag", "Pallet (144 x 9lb)", "1CF Bag", "Pallet (50 x 1CF)", "Tote", "Truckload (~24 tons)"].map((label) => ({ key: label, label })) },
  { id: 134, label: "Nature's Blanket", slug: "natures-blanket", image: PRODUCT_PHOTO_BY_SLUG["natures-blanket"], formats: ["2CF Bag", "Pallet (25 x 2CF)", "Tote", "Truckload (22 pallets)"].map((label) => ({ key: label, label })) },
  { id: 3000, label: "Nature's Blanket Premium", slug: "natures-blanket-premium", image: PRODUCT_PHOTO_BY_SLUG["natures-blanket-premium"], formats: ["2CF Bag", "Pallet (25 x 2CF)", "Tote", "Bulk Pickup", "Truckload (~60 cu yd)"].map((label) => ({ key: label, label })) },
];

const fetchProductOptions = async (): Promise<ProductOption[]> => {
  const response = await fetch("/api/public/products");
  if (!response.ok) throw new Error("Failed to load products");
  const body = await response.json();
  const records = Array.isArray(body) ? body : Array.isArray(body?.products) ? body.products : [];
  return records
    .filter((product: any) => product && product.isHidden !== true && product.is_hidden !== true)
    .map((product: any) => {
      const slug = String(product.slug || "");
      const formats = (product.sizePriceOptions || product.size_price_options || [])
        .filter((format: any) => format?.isActive !== false && format?.is_active !== false)
        .map((format: any) => ({ key: String(format.key || format.label), label: String(format.label || format.key) }));
      return {
        id: Number(product.id),
        label: product.displayTitle || product.display_title || product.productType || product.product_type || product.name || "Product",
        slug,
        image: PRODUCT_PHOTO_BY_SLUG[slug] || String(product.imageUrl || product.image_url || ""),
        formats,
      };
    })
    .filter((product: ProductOption) => Number.isFinite(product.id))
    .sort((a: ProductOption, b: ProductOption) => a.label.localeCompare(b.label));
};

const FieldError = ({ id, message }: { id: string; message?: string }) => message ? <p id={id} className="text-sm font-medium text-red-700">{message}</p> : null;

export const SimpleOrderForm: React.FC = () => {
  const { toast } = useToast();
  const { items, removeItem, clearCart, totalPrice } = useQuoteCart();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const preselectedProductId = searchParams.get("productId") || "";
  const preselectedProductName = searchParams.get("product") || "";
  const [leadInfo, setLeadInfo] = useState<LeadInfo>({ name: "", email: "", phone: "", customer_category: "", company: "", notes: "", preferred_date: "" });
  const [productRows, setProductRows] = useState<ProductRow[]>([{ id: crypto.randomUUID(), productId: preselectedProductId, format: "", quantity: 1 }]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [pickupLocation, setPickupLocation] = useState("phoenix");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["quoteProductOptions"], queryFn: fetchProductOptions, staleTime: 60_000, retry: 1 });
  const productOptions = data?.length ? data : FALLBACK_PRODUCTS;
  const productById = useMemo(() => new Map(productOptions.map((product) => [String(product.id), product])), [productOptions]);
  const selectedProducts = productRows.map((row) => ({ ...row, product: productById.get(row.productId) })).filter((row) => row.productId && row.product);

  const updateLead = (field: keyof LeadInfo, value: string) => {
    setLeadInfo((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateForm = () => {
    const next: Record<string, string> = {};
    if (!leadInfo.name.trim()) next.name = "Enter your name.";
    if (!leadInfo.email.trim()) next.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadInfo.email)) next.email = "Enter a valid email address.";
    if (!leadInfo.phone.trim()) next.phone = "Enter your phone number.";
    if (!leadInfo.customer_category) next.customer_category = "Choose a customer type.";
    if (fulfillment === "delivery" && !/^\d{5}(-\d{4})?$/.test(deliveryZip.trim())) next.deliveryZip = "Enter a valid delivery ZIP.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) window.setTimeout(() => document.getElementById(first)?.focus(), 0);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    let result;
    try {
      const customerSummary = [`Customer type: ${leadInfo.customer_category}`, leadInfo.company.trim() ? `Company / farm: ${leadInfo.company.trim()}` : "", "Marketing contact permission: Yes"].filter(Boolean).join("\n");
      const fulfillmentSummary = fulfillment === "pickup"
        ? `Pickup: ${pickupLocation === "phoenix" ? "Phoenix Distribution Center" : "Congress Processing Plant"}`
        : fulfillment === "delivery" ? `Delivery ZIP: ${deliveryZip.trim()}` : "Fulfillment: Please help me choose";
      const productSummary = selectedProducts.map((row, index) => `${index + 1}. ${row.quantity} × ${row.product!.label}${row.format ? ` — ${row.format}` : " — format to confirm"}`).join("\n");
      const cartSummary = items.map((item) => `${item.quantity}x ${item.format} — ${item.productName} (${fmt(item.unitPrice * item.quantity)})`).join("\n");
      const sections = [
        `--- CUSTOMER INFO ---\n${customerSummary}\n--- END CUSTOMER INFO ---`,
        `--- FULFILLMENT ---\n${fulfillmentSummary}\n--- END FULFILLMENT ---`,
        productSummary ? `--- PRODUCTS REQUESTED ---\n${productSummary}\n--- END PRODUCTS ---` : "",
        cartSummary ? `--- QUOTE CART ---\n${cartSummary}\nEstimated Total: ${fmt(totalPrice)}\n--- END CART ---` : "",
        leadInfo.notes.trim(),
      ].filter(Boolean);
      result = await submitLeadPayload({ ...leadInfo, marketing_opt_in: true, notes: sections.join("\n\n"), preferred_date: leadInfo.preferred_date || null, source_url: window.location.href, brand_id: import.meta.env.VITE_DEFAULT_BRAND === "rls" ? "regenerative_landscaper_supply" : undefined });
    } catch (error) {
      const requestError = error instanceof LeadSubmissionRequestError ? error : null;
      console.error("Error submitting form:", {
        error,
        status: requestError?.status,
        requestId: requestError?.requestId,
      });
      toast({ title: "Submission Failed", description: "We couldn't send the request. Please try again or call us.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    // The server has accepted the lead. Optional browser-side cleanup or
    // tracking failures must never reclassify it as a failed submission.
    completeLeadSuccess(
      () => setShowThankYou(true),
      [
        () => clearCart(),
        () => trackEvent("Quote Request Submitted", { source: "order_page", product_count: selectedProducts.length, fulfillment }),
        () => trackEcommerceEvent("generate_lead", { lead_type: "quote_form", source: "order_page", pickup_sales_channel: "osw_yard" }),
        () => toast({ title: "Quote Request Submitted", description: "We'll contact you shortly with pricing." }),
      ],
      (error) => console.warn("Non-critical post-submit action failed after the lead was accepted:", { error, requestId: result.requestId }),
    );
    setIsSubmitting(false);
  };

  if (showThankYou) return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
      <h1 className="text-3xl font-bold text-stone-900">Quote request received</h1>
      <p className="text-stone-600">We’ll review availability, format, and fulfillment, then contact you with pricing.</p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild><Link href="/products">Browse products</Link></Button>
        <Button asChild variant="outline"><a href={CUSTOMER_SUPPORT_PHONE_TEL} data-official-support-phone="true" data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}>Call <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span></a></Button>
      </div>
      <p className="text-xs text-stone-500">Same-day pickup may be available, {HOURS_LABEL}.</p>
    </div>
  );

  const fieldProps = (field: keyof LeadInfo) => ({ "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${field}-error` : undefined });

  return (
    <div className="bg-[#f5f3ed] px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-[#264027] px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6c1a0]">Fast, clear local pricing</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Request a Quote</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">Choose products and fulfillment. We’ll confirm the best format, availability, and final price.</p>
          <a href={CUSTOMER_SUPPORT_PHONE_TEL} data-official-support-phone="true" data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold ring-1 ring-white/20 hover:bg-white/15"><Phone className="h-4 w-4" />Call <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span></a>
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(330px,.75fr)] lg:items-start">
          <div className="space-y-5">
            <Card className="rounded-2xl border-stone-200 p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="flex items-center gap-2 text-lg font-bold"><ShoppingBag className="h-5 w-5 text-primary" />What do you need?</h2><p className="mt-1 text-sm text-stone-500">Select a product, format, and estimated quantity.</p></div>
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setProductRows((rows) => [...rows, { id: crypto.randomUUID(), productId: "", format: "", quantity: 1 }])}><Plus className="mr-1 h-4 w-4" />Add</Button>
              </div>
              <div className="mt-5 space-y-3">
                {productRows.map((row, index) => {
                  const selected = productById.get(row.productId);
                  return <div key={row.id} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 sm:p-4">
                    <div className="grid grid-cols-[76px_1fr_auto] items-center gap-3">
                      <div className="h-[76px] w-[76px] overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
                        {selected?.image ? <img src={selected.image} alt={`${selected.label} product package`} width="180" height="180" loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-stone-300"><PackageCheck className="h-7 w-7" /><span className="sr-only">Choose a product to see its photo</span></div>}
                      </div>
                      <div className="min-w-0"><Label htmlFor={`product-${row.id}`}>Product {index + 1}</Label><select id={`product-${row.id}`} value={row.productId} onChange={(e) => setProductRows((rows) => rows.map((item) => item.id === row.id ? { ...item, productId: e.target.value, format: "" } : item))} className="mt-1 min-h-[46px] w-full rounded-lg border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option value="">Select a product</option>{preselectedProductId && preselectedProductName && !productById.has(preselectedProductId) ? <option value={preselectedProductId}>{preselectedProductName}</option> : null}{productOptions.map((product) => <option key={product.id} value={product.id}>{product.label}</option>)}</select></div>
                      {productRows.length > 1 ? <button type="button" onClick={() => setProductRows((rows) => rows.filter((item) => item.id !== row.id))} className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label={`Remove product ${index + 1}`}><Trash2 className="h-4 w-4" /></button> : <span />}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]">
                      <div><Label htmlFor={`format-${row.id}`}>Format</Label><select id={`format-${row.id}`} value={row.format} onChange={(e) => setProductRows((rows) => rows.map((item) => item.id === row.id ? { ...item, format: e.target.value } : item))} disabled={!selected} className="mt-1 min-h-[46px] w-full rounded-lg border border-input bg-white px-3 text-sm disabled:bg-stone-100"><option value="">Help me choose</option>{selected?.formats.map((format) => <option key={format.key} value={format.label}>{format.label}</option>)}</select></div>
                      <div><Label htmlFor={`quantity-${row.id}`}>Quantity</Label><Input id={`quantity-${row.id}`} type="number" min="1" inputMode="numeric" value={row.quantity} onChange={(e) => setProductRows((rows) => rows.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Number(e.target.value) || 1) } : item))} className="mt-1 min-h-[46px]" /></div>
                    </div>
                  </div>;
                })}
                {isLoading ? <p className="text-xs text-stone-500" role="status">Loading the full product catalog…</p> : null}
              </div>
            </Card>

            <Card className="rounded-2xl border-stone-200 p-4 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Truck className="h-5 w-5 text-primary" />Pickup or delivery?</h2>
              <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Fulfillment choice">{(["pickup", "delivery", "not-sure"] as Fulfillment[]).map((choice) => <button key={choice} type="button" role="radio" aria-checked={fulfillment === choice} onClick={() => { setFulfillment(choice); setErrors((current) => ({ ...current, deliveryZip: "" })); }} className={`min-h-[58px] rounded-xl border px-2 text-sm font-bold ${fulfillment === choice ? "border-[#264027] bg-[#e8efe3] text-[#264027] ring-1 ring-[#264027]" : "border-stone-200 bg-white text-stone-600"}`}>{choice === "pickup" ? "Pickup" : choice === "delivery" ? "Delivery" : "Help me choose"}</button>)}</div>
              {fulfillment === "pickup" ? <div className="mt-4"><Label htmlFor="pickupLocation">Pickup location</Label><select id="pickupLocation" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} className="mt-1 min-h-[46px] w-full rounded-lg border border-input bg-white px-3 text-sm"><option value="phoenix">Phoenix Distribution Center</option><option value="congress">Congress Processing Plant</option></select></div> : null}
              {fulfillment === "delivery" ? <div className="mt-4"><Label htmlFor="deliveryZip">Delivery ZIP *</Label><Input id="deliveryZip" inputMode="numeric" autoComplete="postal-code" value={deliveryZip} onChange={(e) => { setDeliveryZip(e.target.value); setErrors((current) => ({ ...current, deliveryZip: "" })); }} aria-invalid={Boolean(errors.deliveryZip)} aria-describedby={errors.deliveryZip ? "deliveryZip-error" : "deliveryZip-help"} placeholder="85009" className="mt-1 min-h-[46px]" /><p id="deliveryZip-help" className="mt-1 text-xs text-stone-500">We’ll confirm delivery cost separately.</p><FieldError id="deliveryZip-error" message={errors.deliveryZip} /></div> : null}
            </Card>

            {items.length > 0 ? <Card className="rounded-2xl border-[#264027]/20 p-4 shadow-sm sm:p-6"><h2 className="text-lg font-bold">Saved cart selections</h2><div className="mt-3 space-y-2">{items.map((item) => <div key={`${item.productId}-${item.format}`} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"><div><p className="font-semibold">{item.productName}</p><p className="text-xs text-stone-500">{item.quantity} × {item.format}</p>{item.discountPercent ? <p className="mt-1 text-xs font-bold text-green-700">{item.discountPercent}% pallet savings · {fmt((item.savingsPerUnit || 0) * item.quantity)}</p> : null}</div><div className="text-right"><p className="font-bold text-primary">{fmt(item.unitPrice * item.quantity)}</p>{item.listUnitPrice && item.listUnitPrice > item.unitPrice ? <p className="text-xs text-stone-400 line-through">{fmt(item.listUnitPrice * item.quantity)}</p> : null}<button type="button" onClick={() => removeItem(item.productId, item.format)} className="mt-1 text-xs text-red-700">Remove</button></div></div>)}</div><div className="mt-3 flex justify-between border-t pt-3 font-bold"><span>Estimated product subtotal</span><span>{fmt(totalPrice)}</span></div></Card> : null}
          </div>

          <div className="space-y-5 lg:sticky lg:top-24">
            <Card className="rounded-2xl border-stone-200 p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">Your contact details</h2>
              {Object.keys(errors).length ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">Please fix the highlighted fields.</div> : null}
              <div className="mt-4 space-y-4">
                <div><Label htmlFor="name">Name *</Label><Input id="name" autoComplete="name" value={leadInfo.name} onChange={(e) => updateLead("name", e.target.value)} {...fieldProps("name")} className="mt-1 min-h-[46px]" /><FieldError id="name-error" message={errors.name} /></div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div><Label htmlFor="email">Email *</Label><Input id="email" type="email" autoComplete="email" value={leadInfo.email} onChange={(e) => updateLead("email", e.target.value)} {...fieldProps("email")} className="mt-1 min-h-[46px]" /><FieldError id="email-error" message={errors.email} /></div><div><Label htmlFor="phone">Phone *</Label><Input id="phone" type="tel" autoComplete="tel" value={leadInfo.phone} onChange={(e) => updateLead("phone", e.target.value)} {...fieldProps("phone")} className="mt-1 min-h-[46px]" /><FieldError id="phone-error" message={errors.phone} /></div></div>
                <div><Label htmlFor="customer_category">Customer type *</Label><select id="customer_category" value={leadInfo.customer_category} onChange={(e) => updateLead("customer_category", e.target.value)} {...fieldProps("customer_category")} className="mt-1 min-h-[46px] w-full rounded-lg border border-input bg-white px-3 text-sm"><option value="">Select one</option><option value="home-gardener">Home gardener</option><option value="farmer-grower">Farmer / grower</option><option value="landscaper">Landscaper</option><option value="nursery-greenhouse">Nursery / greenhouse</option><option value="contractor">Contractor</option><option value="municipal-commercial">Municipal / commercial</option><option value="other">Other</option></select><FieldError id="customer_category-error" message={errors.customer_category} /></div>
                <div><Label htmlFor="company">Company, farm, or project</Label><Input id="company" autoComplete="organization" value={leadInfo.company} onChange={(e) => updateLead("company", e.target.value)} className="mt-1 min-h-[46px]" /></div>
                <div><Label htmlFor="preferred_date" className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Preferred date</Label><Input id="preferred_date" type="date" value={leadInfo.preferred_date} onChange={(e) => updateLead("preferred_date", e.target.value)} min={new Date(Date.now() + 86400000).toISOString().split("T")[0]} className="mt-1 min-h-[46px]" /></div>
                <div><Label htmlFor="notes">Project notes</Label><Textarea id="notes" value={leadInfo.notes} onChange={(e) => updateLead("notes", e.target.value)} placeholder="Timeline, access, acreage, or anything else we should know" rows={4} className="mt-1" /></div>
              </div>
              <p className="mt-4 rounded-xl bg-stone-100 p-3 text-xs leading-relaxed text-stone-600">By submitting, you allow Soil Seed &amp; Water to contact you about this request and add you to our marketing contact list.</p>
              <Button type="submit" disabled={isSubmitting} size="lg" className="mt-4 min-h-[54px] w-full rounded-xl text-base font-extrabold shadow-md">{isSubmitting ? "Sending request…" : "Request My Quote"}</Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-stone-500"><MapPin className="h-3.5 w-3.5" />Arizona-made · pickup or delivery</p>
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
};
