import { Helmet } from "react-helmet-async";
import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";

const NewsletterSignup = ({ giveawayEnded = false }: { giveawayEnded?: boolean }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [customerCategory, setCustomerCategory] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          customerCategory,
          consent,
          website,
          source: params.get("source") || (giveawayEnded ? "post-giveaway-community" : "keep-growing"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We could not save your subscription.");

      trackEvent("Newsletter Subscribed", { source: params.get("source") || "keep-growing" });
      setSuccess(true);
    } catch (submitError: any) {
      setError(submitError?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-[75vh] bg-[#f4f0e3] px-4 py-10 sm:py-16">
      <Helmet>
        <title>Keep Growing With Us | Soil Seed &amp; Water</title>
        <meta name="description" content="Be first to hear about future giveaways, garden tips, new products, and local events from Soil Seed & Water." />
        <link rel="canonical" href="https://www.organicsoilwholesale.com/keep-growing" />
      </Helmet>
      {giveawayEnded && <div className="mx-auto mb-8 max-w-6xl rounded-2xl border border-[#d6b470] bg-white p-5 text-[#133d2a]">
        <p className="font-heading text-xl font-bold">This giveaway has wrapped up. There’s more to grow.</p>
        <p className="mt-2 text-sm leading-6">Our October 3 drawing is complete and entries are closed. Join our community below to hear what’s next. This signup is for future updates, not entry into a drawing.</p>
        <a href="/" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">Back to Organic Soil Wholesale</a>
      </div>}
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-start">
        <div className="space-y-7">
          <div className="text-center lg:text-left">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#8a6a42]">Soil Seed &amp; Water</p>
            <h1 className="font-heading text-3xl font-bold leading-tight text-primary sm:text-4xl xl:text-5xl">Keep Growing With Us</h1>
            <p className="mt-5 text-base leading-7 text-neutral-700">
              Be first to hear about future giveaways, garden tips, new products, and local events. Join the Soil Seed &amp; Water community and be part of what’s growing.
            </p>
          </div>
          <img
            src="/images/giveaway/complete-fall-garden-hero-v9.png"
            alt="A thriving raised-bed vegetable garden"
            width={1536}
            height={1024}
            loading="lazy"
            className="mx-auto w-full max-w-[500px] rounded-3xl object-contain"
          />
        </div>

        <Card className="border-0 shadow-xl">
          <CardContent className="p-6 sm:p-8">
            {success ? (
              <div role="status" aria-live="polite" className="py-8 text-center">
                <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-primary" />
                <h2 className="font-heading text-2xl font-bold text-primary">You’re part of what’s growing.</h2>
                <p className="mt-3 leading-7 text-neutral-600">You’re signed up for future giveaways, garden tips, new products, and local events. Watch your inbox for what’s next.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Mail className="mb-4 h-9 w-9 text-primary" />
                  <h2 className="font-heading text-2xl font-bold text-primary">Be part of what’s next</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">No spam. Unsubscribe any time.</p>
                </div>

                <div>
                  <label htmlFor="newsletter-name" className="mb-2 block text-sm font-semibold text-neutral-800">First name <span className="font-normal text-neutral-500">(optional)</span></label>
                  <Input className="h-11" id="newsletter-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="given-name" maxLength={120} />
                </div>

                <div>
                  <label htmlFor="newsletter-email" className="mb-2 block text-sm font-semibold text-neutral-800">Email address</label>
                  <Input className="h-11" id="newsletter-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="newsletter-phone" className="mb-2 block text-sm font-semibold text-neutral-800">Phone number</label>
                    <Input className="h-11" id="newsletter-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(602) 555-0123" autoComplete="tel" inputMode="tel" required maxLength={30} />
                  </div>
                  <div>
                    <label htmlFor="newsletter-category" className="mb-2 block text-sm font-semibold text-neutral-800">I’m a…</label>
                    <select id="newsletter-category" value={customerCategory} onChange={(event) => setCustomerCategory(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      <option value="">Select one</option>
                      <option value="home-gardener">Home gardener</option>
                      <option value="farmer">Farmer / grower</option>
                      <option value="landscaper">Landscaper</option>
                      <option value="nursery">Nursery / greenhouse</option>
                      <option value="contractor">Contractor</option>
                      <option value="municipal-commercial">Municipal / commercial</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="hidden" aria-hidden="true">
                  <label htmlFor="newsletter-website">Website</label>
                  <Input id="newsletter-website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
                </div>

                <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-neutral-700">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required className="mt-1 h-4 w-4 accent-[#264027]" />
                  <span>Yes, email me about future giveaways, garden tips, new products, and local events from Soil Seed &amp; Water. I can unsubscribe at any time.</span>
                </label>

                {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

                <Button type="submit" disabled={submitting} className="w-full py-6 text-base font-bold">
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Count me in"}
                </Button>
                <p className="text-center text-xs leading-5 text-neutral-500">We respect your inbox. No spam and no sold email addresses.</p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default NewsletterSignup;
