import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, CheckCircle2, Loader2, Minus, Plus, Sprout } from 'lucide-react';
import SEO from '@/components/layout/SEO';
import { trackEvent } from '@/lib/analytics';
import { GARDEN_BED } from '@shared/gardenBedOrders.js';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const inputStyle = 'mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-[#264027] focus:ring-2 focus:ring-[#264027]/20';

export default function GardenBedKit() {
  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState('pickup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ id: string; quantity: number } | null>(null);
  const sending = useRef(false);
  const token = useRef(crypto.randomUUID());
  const resultRef = useRef<HTMLDivElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/leads/submit', {
        method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'osw_garden_bed_order', request_token: token.current,
          name: fields.get('name'), email: fields.get('email'), phone: fields.get('phone'),
          quantity, fulfillment, zip: fields.get('zip') || '', notes: fields.get('notes'),
          website: fields.get('website'), contact_consent: fields.get('contact_consent') === 'on',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.leadId) throw new Error(data.error || 'We could not confirm your request. Please try again.');
      setReceipt({ id: String(data.leadId), quantity });
      try { trackEvent('Garden Bed Order Request Submitted', { quantity, fulfillment, value: quantity * GARDEN_BED.price, currency: 'USD' }); } catch { /* Analytics must never hide a saved request. */ }
      requestAnimationFrame(() => { resultRef.current?.focus(); resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally { sending.current = false; setBusy(false); }
  }

  return <>
    <SEO title="4 × 8 Garden Bed Kit — $599 Launch Offer" description="Order your $599 garden bed kit: four steel posts, lumber, pea gravel, and soil cloth. Limited-time launch offer. No payment required to request an order. Delivery and growing materials sold separately." canonical="https://www.organicsoilwholesale.com/products/garden-bed-kit" ogImage={GARDEN_BED.image} />
    <div className="bg-[#f5f2e9] text-[#253a2a]">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-8 md:pt-10">
        <Link href="/products" className="inline-flex min-h-11 items-center text-sm font-medium text-stone-600 hover:underline">← All products</Link>
        <div className="mt-4 grid items-start gap-9 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <span className="inline-flex rounded-full bg-[#264027] px-4 py-2 text-xs font-bold uppercase tracking-[.12em] text-[#f2d9a4]">New · Limited-time launch offer</span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">A little space.<br />A lot to grow.</h1>
            <p className="mt-4 text-lg text-stone-600">Your 4 × 8 ft garden bed, built around steel corners and natural lumber. Start with the essentials. Make the garden your own.</p>
            <div className="mt-5 flex flex-wrap items-center gap-4 lg:hidden"><strong className="text-2xl">$599 <span className="text-sm font-normal">per bed</span></strong><a href="#order-request" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#264027] px-5 font-semibold text-white">Request your bed <ArrowRight className="h-4 w-4" /></a></div>
            <figure className="mt-7">
              <img src={GARDEN_BED.image} width="1200" height="800" alt="Garden bed concept showing a wood frame and steel corner posts" className="aspect-[4/3] w-full rounded-3xl bg-[#ece8dc] object-contain p-3" fetchPriority="high" />
              <figcaption className="mt-3 text-xs leading-relaxed text-stone-500">Concept image from our garden-bed video. Soil, mulch, plants, irrigation, and accessories shown are not included.</figcaption>
            </figure>
            <div className="mt-7 rounded-2xl border border-[#264027]/15 bg-white/60 p-6">
              <h2 className="font-heading text-xl font-bold">The essentials, included.</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">{GARDEN_BED.included.map((item: string) => <li key={item} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#56754c]" />{item}</li>)}</ul>
              <p className="mt-5 border-t border-stone-200 pt-4 text-sm leading-relaxed text-stone-600">Add your favorite growing mix and finishing touches separately. {GARDEN_BED.exclusions}</p>
            </div>
          </div>
          <div id="order-request" className="scroll-mt-24 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_18px_60px_rgba(38,64,39,0.08)] sm:p-8 lg:sticky lg:top-24">
            {receipt ? <div ref={resultRef} tabIndex={-1} role="status" className="py-8 outline-none">
              <CheckCircle2 className="h-12 w-12 text-[#56754c]" />
              <h2 className="mt-5 font-heading text-3xl font-bold">Your next garden starts here.</h2>
              <p className="mt-4 text-stone-600">We received your request for {receipt.quantity} garden {receipt.quantity === 1 ? 'bed' : 'beds'}. Our team will contact you to confirm availability, timing, fulfillment, and your final total.</p>
              <p className="mt-5 rounded-xl bg-[#f5f2e9] p-4 text-sm">Request #{receipt.id}<br /><strong>No payment has been taken.</strong> This is an order request, not a confirmed reservation.</p>
              <Link href="/products" className="mt-6 inline-flex min-h-12 items-center gap-2 font-semibold">Explore soils &amp; amendments <ArrowRight className="h-4 w-4" /></Link>
            </div> : <>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b6940]">4 × 8 Garden Bed Kit</p>
              <div className="mt-3 flex items-baseline gap-3"><span className="font-heading text-5xl font-bold">$599</span><span className="text-stone-500">per bed</span></div>
              <p className="mt-2 text-sm text-stone-500">Launch price · Delivery and tax extra</p>
              <h2 className="mt-7 font-heading text-2xl font-bold">Let’s get your garden started.</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">Send your order request. We’ll follow up with availability and next steps. No payment or deposit required today.</p>
              <form onSubmit={submit} className="mt-6 space-y-5">
                <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f5f2e9] p-4">
                    <label htmlFor="bed-quantity" className="font-semibold">Number of beds</label>
                    <div className="flex items-center rounded-xl border border-stone-300 bg-white">
                      <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity(q => Math.max(1, q - 1))} className="flex h-12 w-12 items-center justify-center disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                      <input id="bed-quantity" aria-label="Number of beds" type="number" min={1} max={100} step={1} required value={quantity || ''} onChange={e => setQuantity(Number(e.target.value))} className="h-12 w-16 border-x border-stone-200 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                      <button type="button" aria-label="Increase quantity" disabled={quantity >= 100} onClick={() => setQuantity(q => Math.min(100, q + 1))} className="flex h-12 w-12 items-center justify-center disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                    </div>
                    <div className="flex w-full justify-between border-t border-stone-200 pt-3 text-sm" aria-live="polite"><span>Kit subtotal</span><strong>{money(quantity * GARDEN_BED.price)}</strong></div>
                  </div>
                  <label className="block text-sm font-medium">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={120} className={inputStyle} /></label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className={inputStyle} /></label>
                    <label className="block text-sm font-medium">Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={30} className={inputStyle} /></label>
                  </div>
                  <label className="block text-sm font-medium">How would you like to receive it?<select value={fulfillment} onChange={e => setFulfillment(e.target.value)} className={inputStyle}><option value="pickup">Local pickup</option><option value="delivery">Delivery — request a separate quote</option><option value="discuss">Help me decide</option></select></label>
                  {fulfillment === 'delivery' && <label className="block text-sm font-medium">Delivery ZIP code<input name="zip" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} required className={inputStyle} /><span className="mt-2 block text-xs font-normal text-stone-500">Delivery is not included in the $599 price.</span></label>}
                  <label className="block text-sm font-medium">Anything we should know? <span className="font-normal text-stone-500">(optional)</span><textarea name="notes" maxLength={2000} rows={3} placeholder="Your timing, garden plans, access details, or soil and mulch you’d like quoted separately…" className={inputStyle} /></label>
                  <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed text-stone-600"><input name="contact_consent" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-[#264027]" /><span>Please contact me about this order request. I understand availability and final pricing will be confirmed before payment.</span></label>
                  {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                  <button type="submit" className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#264027] px-4 font-semibold text-white transition hover:bg-[#3c5233] disabled:opacity-60">{busy ? <><Loader2 className="h-5 w-5 animate-spin" />Submitting…</> : <>Request my garden bed{quantity > 1 ? 's' : ''}<ArrowRight className="h-5 w-5" /></>}</button>
                </fieldset>
                <p className="text-center text-xs leading-relaxed text-stone-500">Limited-time launch offer. Subject to availability.<br />No payment today. No automatic marketing signup.</p>
              </form>
            </>}
          </div>
        </div>
        <p className="mt-12 flex items-center justify-center gap-2 text-sm text-stone-600"><Sprout className="h-4 w-4" />Made for your next growing season.</p>
      </div>
    </div>
  </>;
}
