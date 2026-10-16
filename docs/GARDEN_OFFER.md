# Garden bed offer on Organic Soil Wholesale

The customer page is /garden-bed-offer.html. The free dairy compost QR page is /garden-gift.html. Both are separate static pages, without advertising scripts or staff cookies.

The restricted /api/garden-bed adapter forwards only configuration, availability, private quote, checkout, payment status and delivery preferences to the shared SSW garden service. It never forwards cookies or staff actions. No duplicate Stripe collector, webhook or payment ledger is created here.

SSW World issues personal links, hosts authenticated staff card entry, handles the unique gift pickup workflow and tracks payments/delivery. Stripe-hosted Checkout returns customers to Organic Soil Wholesale. Legacy SSW public links preserve their private fragments when redirecting to OSW.

The same finite installment plan and canonical sp_orders ledger are used across the storefront and staff UI. General customer checkout remains held until the owner production pilot has been verified. Never enable that flag merely because the public page is deployed.

Run node --test test/garden-offer.test.mjs, npm run build and the existing phone/security checks before release. Coordinate shared changes with Owner Command Center/docs/GARDEN_CHECKOUT_READINESS.md.

## Offer presentation · October 15, 2026

- Reference bundle value: **$1,408.43**, including delivery. This is a bundle comparison value, not a verified previous selling price. Use “Bundle value.”
- Pay in full: **$945.43 + tax**, saving **$463** against that value and **$94.44** compared with the payment plan.
- Payment plan: **$346.66 / $346.66 / $346.55**, one month apart, **$1,039.87 total + tax**. Actual tax and dates come from the server quote.
- Sources: the hub’s `Marketing Plan/Garden Bed Kit/Editable Files/Price Sheet/evidence.json` and saved giveaway sales master plan. No purchase deadline or stock quantity is confirmed; use “limited-time offer” without a countdown.
- Free Arizona delivery applies to **November 2026 deliveries only**. Date, route and unloading arrangements require confirmation.
- Personal offer links, giveaway eligibility and payment release controls remain required. Customer pilot links hide the bundle promotion so the $1 test has no conflicting price or product claims.
- Pricing shortcuts preserve private URL fragments. The phone shortcut hides when payment choices are visible. Images remain responsive WebP; the assembly video uses `preload="none"`.

Local validation: production build/security gate, seven garden API tests, phone-link suite, call-tracking exclusions, JS syntax and whitespace checks passed. Browser checks covered desktop and 376–400 px phone widths, plan selection, pricing navigation, personal-link gate and no horizontal overflow. No production payment was submitted.
