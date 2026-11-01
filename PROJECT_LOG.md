# Organic Soil Wholesale - Project Log

## 2026-02-06 | Operations Dashboard - BOL Duplicate, Email & Smart Autocomplete

**Session Focus:** Enhance BOL workflow with duplicate functionality, professional email sending, and smart address autocomplete

### Completed

1. **Duplicate & Modify BOL**
   - Added Duplicate button on ViewBOL page (header actions) and Operations list (row actions)
   - Navigates to CreateBOL with `?duplicate=<id>` param
   - Pre-fills all fields from source BOL (customer, destination, origin, material, carrier, notes)
   - Date auto-set to today, time fields cleared
   - Clear header indicating duplication source: "Duplicate BOL from BOL-XXXXXXXX-XXX"

2. **Professional HTML Email for BOLs**
   - Changed sender from `info@` to `SSW Operations <operations@soilseedandwater.com>`
   - Built branded HTML email template with SSW green (#264027), BOL details card, signature block
   - Subject line includes customer name: "Bill of Lading - BOL-XXX | Customer Name"
   - Email dialog shows live preview (from, to, subject, attachment)
   - Pre-fills recipient name from customer, plain text fallback included

3. **Smart Address Autocomplete**
   - New API endpoint: `GET /api/admin/operations/recent-addresses` (returns unique destinations + carriers from last 200 BOLs)
   - Customer Name field shows dropdown of recent destinations with address preview and "last used X days ago"
   - Click to auto-fill all destination + contact fields
   - Carrier Name field shows recent carriers with driver/truck info and timestamps
   - Click to auto-fill all carrier/transport fields

### Files Modified
- `client/src/pages/admin/CreateBOL.tsx` - Duplicate mode + autocomplete
- `client/src/pages/admin/ViewBOL.tsx` - Duplicate button + email dialog upgrade
- `client/src/pages/admin/Operations.tsx` - Duplicate button in row actions
- `server/routes/admin/operations.ts` - Recent addresses endpoint + HTML email template
- `_reference/operations-dashboard.md` - Updated feature docs

### Next Steps
- Deploy to Vercel
- Verify `operations@soilseedandwater.com` works in Resend (domain already verified)

---

## 2026-01-21 | Product Pages Professional Redesign

**Session Focus:** Enhance Products listing, ProductShowcase cards, and ProductDetail page with professional design and subtle Arizona branding

### Completed

1. **Products Page Header Redesign**
   - Added subtle Arizona desert gradient background
   - New "Wholesale Catalog" badge with animated indicator
   - Improved typography hierarchy with larger headings
   - Better CTA buttons with shadow effects

2. **ProductShowcase Component Overhaul**
   - Enhanced search bar with rounded corners and shadow
   - Added results count display
   - Completely redesigned product cards:
     - Rounded corners (rounded-3xl)
     - Category badge with Leaf icon over image
     - Hover state with "View Product" button overlay
     - Image zoom effect on hover
     - Bottom action area with "Wholesale available" text
     - Smoother transitions and hover effects

3. **ProductDetail Page Enhancements**
   - Arizona-themed gradient backgrounds (subtle)
   - Updated hero card with Arizona color accents
   - "Organic Soil Wholesale" branding text
   - Improved stat cards with alternating icon colors
   - Redesigned CTA sidebar card with dark gradient
   - Enhanced confidence points section
   - Added bottom CTA section for easy quote requests

### Key Files Changed

| File | Changes |
|------|---------|
| `Products.tsx` | New header section with Arizona gradients, improved CTAs |
| `ProductShowcase.tsx` | Complete card redesign, better search/filter UI |
| `ProductDetail.tsx` | Hero section, CTA sidebar, stats, confidence points, bottom CTA |

### Design Principles Applied

- Professional wholesale aesthetic
- Subtle Arizona colors (sage, copper, terracotta) as accents
- Clean white backgrounds with soft gradients
- Improved touch targets for mobile (44x44px minimum)
- Smooth hover transitions and micro-interactions
- Consistent spacing and typography

---

## 2026-01-21 | Arizona Branding Overhaul (HB 2819)

**Session Focus:** Rebrand website with "Made in Arizona" messaging to leverage upcoming HB 2819 state compost requirements

### Context - HB 2819: State Landscaping; Arizona Compost; Requirements

Joe Roselle from AZCC shared that **HB 2819** was just dropped by Rep. Cavero. This bill requires:
- AZ Dept of Administration, ADOT, and AZ State Parks Board to **use Arizona-produced compost** when available
- "Available" means: produced in AZ, meets quality standards, deliverable in reasonable time, price within **20% of out-of-state alternatives**

**Strategic Impact:** Government contracts will now prioritize local Arizona compost producers like SSW.

### Completed

1. **Updated Color Palette to Arizona Theme**
   - Primary: Desert Sage Green (150, 32%, 38%)
   - Secondary: Arizona Terracotta (18, 55%, 42%)
   - Accent: Copper/Golden Arizona Sun (32, 80%, 52%)
   - Added Arizona-specific colors: copper, terracotta, sunset, sand, sage, desert

2. **Added "Made in Arizona" Branding Throughout**
   - Homepage: Copper banner strip at top - "Proudly Produced in Arizona"
   - Header: "Made in Arizona" badge under logo (desktop + mobile)
   - Footer: Arizona Made strip + sustainability messaging
   - Hero section: Arizona badge + updated headline "Arizona-Made Organic Compost"

3. **Updated SEO/Meta Tags**
   - Title: "Arizona-Made Organic Compost | Wholesale Bulk Soil Supplier | Local AZ Compost"
   - Keywords: Added "Arizona compost", "Arizona made soil", "local compost Arizona", "HB 2819"
   - Description: Emphasizes locally-produced, Arizona-made products

4. **Created Arizona CSS Classes**
   - `.arizona-badge` - Gradient copper badge
   - `.arizona-badge-outline` - Outlined version
   - `.arizona-gradient-text` - Text gradient (copper → sunset → sage)
   - `.arizona-divider` - Gradient section divider

### Key Files Changed

| File | Changes |
|------|---------|
| `index.css` | New Arizona color palette, Arizona-specific CSS classes |
| `tailwind.config.ts` | Added `arizona` color object (copper, terracotta, sunset, sand, sage, desert) |
| `Home.tsx` | Added Arizona banner, updated hero with Arizona badge and messaging |
| `Header.tsx` | Added "Made in Arizona" badge under logo in desktop and mobile |
| `Footer.tsx` | Added Arizona Made strip, sustainability message |
| `client/index.html` | Updated title, description, keywords, OG tags for Arizona SEO |

### Design Direction

**Aesthetic:** Desert-earth organic - warm terracotta and sage tones evoking Arizona's landscape
- Professional wholesale feel
- Bold "Made in Arizona" badges (copper color)
- Warm color palette (terracotta, copper, sage)

### Next Steps

- [ ] Monitor HB 2819 progress through committee
- [ ] Create dedicated page about Arizona-made benefits
- [ ] Consider badge/seal design for product pages
- [ ] Update email templates with Arizona branding

---

## 2026-01-21 | Product Display Fix & Pay & Pickup Hidden

**Session Focus:** Fix product display issues, hide Pay & Pickup feature (not yet live), optimize size category images

### Completed

1. **Hidden Pay & Pickup Feature** (not ready for production)
   - Removed "Pay & Pickup Now" button from desktop header (`Header.tsx:260-268`)
   - Removed "Now Available" promotional box from mobile menu (`Header.tsx:342-351`)
   - Hidden Pay & Pickup badge from product detail hero
   - Changed availability text to always show "Delivery planning included"
   - Hidden Pay & Pickup button from product detail CTA section

2. **Fixed Size Options Display**
   - Now only shows sizes with `is_active: true` from database
   - Hidden pricing display (not yet ready to show prices publicly)
   - Updated SIZE_CATALOG with correct labels and descriptions from Airtable

3. **Compressed Size Category Images**
   - Created `/client/public/images/categories/sizes/` folder
   - Compressed images from ~2MB to ~80-120KB each using sharp
   - Images: Pallet of Box, Pallet of 1CF bags, 2.2 CY Tote, Bulk delivery, CY of Bulk

4. **Simplified Product Card UI**
   - Removed "Catalog Preview" badge noise from ProductShowcase

### Key Files Changed

| File | Changes |
|------|---------|
| `Header.tsx` | Removed Pay & Pickup buttons (desktop + mobile) |
| `ProductDetail.tsx` | Hidden Pay & Pickup badge/button, filtered size options by `is_active`, hidden pricing |
| `ProductShowcase.tsx` | Removed "Catalog Preview" badge |
| `sizeCatalog.ts` | Updated labels/descriptions to match Airtable pallet configurations |

### Size Categories Reference (from Airtable)

| Size | Configuration | Est. Weight |
|------|---------------|-------------|
| Pallet of 9 lb Bags | 36 cases × 4 bags = 144 units | ~1,296 lbs |
| Pallet of 1CF Bags | 50 bags stacked | ~2,000 lbs |
| 2.2 CY Tote (Supersack) | 1 tote per pallet | ~2,000 lbs |
| Bulk/Truckload | 22-24 tons or 90-110 CY | varies |

### Live Products (6 total)

1. **Artmis Root Boost** (slug: `artemis`) - Tree and Shrub Planting Amendment
2. **SKMicrosource** (slug: `oil-mendment-13`) - Soil Amendment
3. **SuperBooster** (slug: `oil-mendment-15`) - Soil Amendment
4. **Mikey's Worm Poop** (slug: `2`) - Worm Castings
5. **Organic Dairy Compost / Dan's Gold** (slug: `dairy-compost`) - Dairy Compost
6. **Amazonian Dark Earth** (slug: `3`) - Biochar Amendment

### Airtable Integration

- **Base ID:** `appDCKrxtJ7oG9O19` (SSW 1)
- **Key Tables:** Products, Size Categories, Pallet configuration
- Size images stored in Size Categories table with illustrations
- Pallet configurations define units per pallet and estimated weights

### Next Steps

- [ ] Fix product slugs (e.g., `oil-mendment-13` should be `skmicrosource`)
- [ ] Add more product images and videos
- [ ] Enable Pay & Pickup when ready for production
- [ ] Show pricing when pricing strategy is finalized

---

## 2026-01-21 | BOL/Weight Ticket System & Vercel Deployment

**Session Focus:** Deploy BOL management system to Vercel, fix API endpoints

### Completed

1. **Added Admin Auth Endpoints to Vercel API** (`api/index.js`)
   - `/api/admin/auth/login` - JWT authentication for operations team
   - `/api/admin/auth/validate` - Token validation
   - `/api/admin/operations/bols` - GET/POST BOL records
   - `/api/admin/operations/bols/:id` - Individual BOL operations
   - `/api/admin/operations/bols/:id/pdf` - PDF generation

2. **Operations Login Credentials**
   - Email: `operations@soilseedandwater.com`
   - Password: `REDACTED_ADMIN_PASSWORD`

3. **Fixed jsonwebtoken Package**
   - Added to dependencies (was only in @types)

### BOL Test Data Created

Three test BOLs with different scenarios:
1. Desert Valley Farms - Full weights (28.25 tons), Congress Plant origin
2. Green Thumb Nursery - Palletized product, no weights
3. Valley Landscaping Co - Equipment/Items, no weights

---

## Architecture Notes

### Tech Stack
- **Frontend:** React + Vite + TypeScript
- **Backend:** Express.js + Drizzle ORM
- **Database:** Supabase PostgreSQL
- **Deployment:** Vercel (with serverless functions in `/api`)
- **Authentication:** JWT for admin, Supabase Auth for customers

### Key API Patterns
- Public endpoints: `/api/public/*`
- Admin endpoints: `/api/admin/*` (require JWT)
- Products fetched from Supabase `products` table
- Size options stored in `size_price_options` JSONB field

### Image Locations
- Product images: `/uploads/products/{id}/gallery-{n}/`
- Size category images: `/images/categories/sizes/`
- Optimized images: `/images/optimized/`

## 2026-10-29 — Simon’s Gold 1 CF studio image
Owner approved studio render. Stored in shared SSW Supabase email-assets and content_library_assets under One Cubic Foot Bag — Realistic Studio Render, product 1000 / size 1cf. Product size_price_options image saved without pricing changes. Added product-specific presentation for size selection and order entry.
