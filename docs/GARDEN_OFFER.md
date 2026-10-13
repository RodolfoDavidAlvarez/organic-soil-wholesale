# Garden bed offer on Organic Soil Wholesale

The customer page is /garden-bed-offer.html. The free dairy compost QR page is /garden-gift.html. Both are separate static pages, without advertising scripts or staff cookies.

The restricted /api/garden-bed adapter forwards only configuration, availability, private quote, checkout, payment status and delivery preferences to the shared SSW garden service. It never forwards cookies or staff actions. No duplicate Stripe collector, webhook or payment ledger is created here.

SSW World issues personal links, hosts authenticated staff card entry, handles the unique gift pickup workflow and tracks payments/delivery. Stripe-hosted Checkout returns customers to Organic Soil Wholesale. Legacy SSW public links preserve their private fragments when redirecting to OSW.

The same finite installment plan and canonical sp_orders ledger are used across the storefront and staff UI. General customer checkout remains held until the owner production pilot has been verified. Never enable that flag merely because the public page is deployed.

Run node --test test/garden-offer.test.mjs, npm run build and the existing phone/security checks before release. Coordinate shared changes with Owner Command Center/docs/GARDEN_CHECKOUT_READINESS.md.
