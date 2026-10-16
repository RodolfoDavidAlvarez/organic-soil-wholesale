# Sales follow-up — October 15, 2026

## Homepage bundles

Restored the owner's original designer banners in the homepage carousel. Links still open the native detail pages, not PDFs. The Big Garden banner's old 54 cu ft total is covered by a 58 cu ft text correction. Prices, SKUs and included materials are unchanged. Detail pages and the Deals hub retain their native layouts.

## Delivery prices

Source: owner's sent email, “Trucking: new delivery pricing and minimums,” October 15, 2026. Only customer selling prices are recorded here.

- Walking-floor delivery: $750 minimum per trip.
- Small dump truck: $375 minimum per trip; up to 6 tons, or approximately 15 cu yd of PlantPal.
- Longer-distance hourly pricing, load counts and difficult-access adjustment remain in effect. No new nearby-area radius was invented.
- Flatbed/pallet and hot-shot pricing remain unchanged.
- Small dump selection requires one bulk material with known tonnage, or PlantPal volume. Unknown/mixed loads keep the larger-truck path; other materials do not inherit PlantPal density.
- Both the production serverless API and local Express quote service use the shared pricing policy. Stored legacy settings cannot lower these two minimums; partial stored rate objects retain default hourly rates.
- Product estimates lead with total delivered price before tax and, when units are known, the delivered price per ton/cu yd. Delivery remains itemized separately on receipts/Stripe.
- Public quote responses no longer include the internal hourly-rate/minimum breakdown. Pricing-policy version invalidates old saved quotes.
- Checkout re-quotes on the server and requests review if the delivery amount changed before order creation/payment.

## Pickup friction

Before requesting payment, checkout refreshes the ASAP ready time. This handles browsers that suspended the minute timer in a background tab. A scheduled pickup that has passed the 30-minute notice window sends the shopper back to select a new time rather than creating a failing payment request. Server validation remains authoritative.

## Search and AI readability

Home, bundle detail, Deals, Operations and product pages now include visible, factual HTML content before JavaScript starts. React replaces it with the interactive page. Existing canonical URLs, structured data, sitemap and privacy restrictions remain. The public AI reference now includes bundle contents/prices, pickup limits, production information and delivery-quote guidance. No guaranteed search ranking or AI recommendation is implied.

## Validation

- Delivery pricing and production API tests cover old settings, small/large loads, full package counts, extra loads, access surcharge, distant destinations and per-unit math.
- Existing pricing, pickup schedule, quote-binding and checkout tests are retained.
- Browser review covers restored banner links, mobile overflow and delivered-price display.
- No fake order, payment, customer contact, email, database migration or campaign send is needed for validation.
