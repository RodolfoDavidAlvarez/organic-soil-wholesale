import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Helmet } from "react-helmet-async";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Leaf,
  MapPin,
  Phone,
  ShoppingBag,
} from "lucide-react";
import {
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_ADDRESS,
} from "@/config/contact";
import { fmtDealPrice, useAddDeal } from "@/components/DealList";
import {
  BUNDLE_PRODUCT_DETAILS,
  getBundleDetails,
  type BundleProductDetail,
} from "@/data/bundleDetails";
import {
  getPromoBundleBySlug,
  PROMO_BUNDLES,
  type PromoBundle,
} from "@shared/promoBundles.js";
import { trackEcommerceEvent, trackEvent } from "@/lib/analytics";
import { bundleComparison, comparisonPrice, bundleGroupImages } from "@/data/bundlePresentation";
import { BundleVideo } from "@/components/BundleVideo";
import { getBundleUsage } from "@shared/bundleUsage.js";
import "./BundleOffers.css";

const legacyOfferAliases: Record<string, string> = {
  "raised-bed-refresh": "garden-refresh",
  "garden-bed-builder": "big-garden-setup",
};
const imageKeys: Record<string, string> = {
  plantpal: "plantpal",
  simons: "simons-gold",
  mikeys: "mikeys-worm-poop",
  mulch: "natures-blanket-premium",
};
const textureImage = (product: BundleProductDetail) =>
  `/images/bundles/${imageKeys[product.productKey]}-texture-640.webp`;
const bagImage = (product: BundleProductDetail, size = 320) =>
  `/images/bundles/${imageKeys[product.productKey]}-${product.productKey === "plantpal" ? "15cf-illustration" : product.productKey === "simons" || product.productKey === "mikeys" ? "1cf" : "bag"}-${size}.webp`;
const productsFor = (offer: PromoBundle) =>
  (getBundleDetails(offer.slug)?.products || []).map(
    (key) => BUNDLE_PRODUCT_DETAILS[key],
  );
const amountFor = (offer: PromoBundle, product: BundleProductDetail) =>
  offer.items.find((item) => item.href === product.href)?.amount || "Included";


export default function BundleOffers() {
  const [, offerParams] = useRoute<{ slug: string }>("/offers/:slug");
  const [, dealParams] = useRoute<{ slug: string }>("/deals/:slug");
  const requestedSlug = (offerParams || dealParams)?.slug;
  const slug = requestedSlug
    ? legacyOfferAliases[requestedSlug] || requestedSlug
    : undefined;
  const offer = useMemo(
    () => (slug ? getPromoBundleBySlug(slug) : undefined),
    [slug],
  );
  return offer ? (
    <OfferPage key={offer.productId} offer={offer} />
  ) : (
    <OffersIndex />
  );
}

function PickupDetails() {
  return (
    <div className="bo-pickup">
      <MapPin size={20} aria-hidden="true" />
      <div>
        <strong>Phoenix yard pickup</strong>
        <p>{PHOENIX_YARD_ADDRESS}</p>
        <p>Tue–Sat · 8 am–1 pm &amp; 2–4 pm</p>
      </div>
    </div>
  );
}

function BundleVisual({
  offer,
  priority = false,
  compact = false,
}: {
  offer: PromoBundle;
  priority?: boolean;
  compact?: boolean;
}) {
  const products = productsFor(offer);
  const primary =
    products.find((product) => product.productKey === "plantpal") ||
    products[0];
  if (!primary) return null;
  const groupImages: Record<string, { src: string; alt: string; free?: string }> = {
    "garden-refresh": { src: bundleGroupImages["garden-refresh"], alt: "Illustration of five mulch bags, three dairy compost bags and two worm castings bags", free: "3 dairy compost bags free" },
    "garden-refresh-plus": { src: bundleGroupImages["garden-refresh-plus"], alt: "Illustration of PlantPal, mulch and worm castings in the Garden Refresh Plus bundle", free: "3 mulch bags free" },
    "big-garden-setup": { src: bundleGroupImages["big-garden-setup"], alt: "Illustration of a large stack of PlantPal with dairy compost, worm castings and mulch" },
  };
  const groupImage = groupImages[offer.slug];
  if (compact && groupImage) {
    return (
      <div className="bo-group-image">
        <img src={groupImage.src} alt={groupImage.alt} loading="lazy" />

      </div>
    );
  }
  return (
    <div className={`bo-visual${compact ? " bo-visual-compact" : ""}`}>
      {!compact && <figure className="bo-texture">
        <img
          src={textureImage(primary)}
          alt={primary.textureAlt}
          width={640}
          height={480}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
        />
        {!compact && <figcaption>
          <Leaf size={16} aria-hidden="true" />
          {primary.productKey === "plantpal"
            ? "Start with a good growing mix."
            : "Feed the soil you already have."}
        </figcaption>}
        <span className="bo-bag-count">
          {offer.bagLabel}
          <span>One bundle</span>
        </span>
      </figure>}
      <div
        className="bo-bag-lineup"
        style={{ "--product-count": products.length } as CSSProperties}
      >
        {products.map((product) => (
          <figure key={product.productKey}>
            <img
              src={bagImage(product)}
              alt={product.productKey === "plantpal" ? "Illustration of a PlantPal 1.5 cubic foot bag" : product.productKey === "simons" || product.productKey === "mikeys" ? `${product.name} 1 cubic foot bag` : product.bagAlt}
              width={320}
              height={product.productKey === "mulch" ? 430 : 320}
              loading="lazy"
              decoding="async"
            />
            <figcaption>{product.name}{compact && <span className="bo-product-amount">{amountFor(offer, product).split(" · ")[0]}</span>}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function OffersIndex() {
  return (
    <main className="bundle-page bo-index">
      <Helmet>
        <title>
          Soil &amp; Raised Garden Bed Deals | Organic Soil Wholesale
        </title>
        <meta
          name="description"
          content="Shop Phoenix soil bundles from $99, or explore the heavy-duty 4×8 raised garden bed and growing-materials offer. Clear contents, pickup details and payment options."
        />
        <link rel="canonical" href="https://organicsoilwholesale.com/offers" />
      </Helmet>
      <div className="bo-shell">
        <header className="bo-index-heading">
          <h1>Garden bundles</h1>
          <p>Choose a complete raised bed or just the materials for a bed you already have.</p>
        </header>
        <section className="bo-index-bundles" aria-label="Garden bundle options">
          <div className="bo-deal-grid">
            <article className="bo-deal-card bo-bed-card">
              <div className="bo-bed-card-image">
                <img
                  src="/garden-bed/bundle-960.webp"
                  srcSet="/garden-bed/bundle-480.webp 480w, /garden-bed/bundle-960.webp 960w"
                  sizes="(min-width: 900px) 45vw, 100vw"
                  alt="Illustration of a raised garden bed with soil, mulch and amendments"
                  width={1536}
                  height={1024}
                  fetchPriority="high"
                />
              </div>
              <div className="bo-deal-card-copy">
                <span className="bo-grid-name">Raised Garden Bed Bundle</span>
                <h2>A heavy-duty 4 × 8 ft raised bed with soil, mulch and amendments.</h2>
                <div className="bo-grid-pricing"><strong>$945.43</strong><span>+ tax</span><s aria-label="Individual value $1,408.43">$1,408.43</s><span>Save $463</span></div>
                <p className="bo-bed-card-note">Free Arizona delivery in November 2026. A personal offer link is required to pay. Image is an illustration.</p>
              </div>
              <a href="/garden-bed-offer.html" className="bo-card-link" aria-label="Explore the Raised Garden Bed Bundle" onClick={() => trackEvent("Garden Bed Offer Clicked", { source: "offers-index" })} />
            </article>
            {PROMO_BUNDLES.map((deal) => (
              <article className="bo-deal-card" key={deal.slug}>
                <BundleVisual offer={deal} compact />
                <div className="bo-deal-card-copy">
                  <span className="bo-grid-name">{deal.title} · {deal.bagLabel}</span>
                  <h2>{getBundleDetails(deal.slug)?.summary}</h2>
                  <div className="bo-grid-pricing">
                    <strong>{fmtDealPrice(deal.salePrice)}</strong><span>+ tax</span>
                    <s aria-label={`Individual bags ${comparisonPrice(bundleComparison[deal.slug])}`}>{comparisonPrice(bundleComparison[deal.slug])}</s>
                    <span>Save {comparisonPrice(bundleComparison[deal.slug] - deal.salePrice)}</span>
                  </div>
                </div>
                <Link href={`/offers/${deal.slug}`} className="bo-card-link" aria-label={`Explore ${deal.title}`} onClick={() => trackEvent("Deal Card CTA Clicked", { bundle: deal.slug, source: "offers-index" })} />
              </article>
            ))}
          </div>
        </section>
        <section
          className="bo-help-panel"
          aria-labelledby="bundle-help-heading"
        >
          <div>
            <span className="bo-eyebrow">A little local help</span>
            <h2 id="bundle-help-heading">Not sure how much you need?</h2>
            <p>
              Tell us your bed size, what is growing and how much soil is
              already there. We can help you choose.
            </p>
          </div>
          <a
            className="bo-button bo-button-outline"
            href={CUSTOMER_SUPPORT_PHONE_TEL}
            aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
            data-official-support-phone="true"
          >
            <Phone size={18} aria-hidden="true" />
            <span data-official-support-phone-text="true">
              {CUSTOMER_SUPPORT_PHONE_DISPLAY}
            </span>
          </a>
        </section>
        <PickupDetails />
      </div>
    </main>
  );
}

function OfferPage({ offer }: { offer: PromoBundle }) {
  const detail = getBundleDetails(offer.slug);
  const products = productsFor(offer);
  const addDeal = useAddDeal();
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<number>();
  useEffect(() => {
    trackEvent("Product Detail Viewed", {
      product_id: offer.productId,
      product_slug: offer.slug,
      product_name: offer.title,
      category: "Garden bundles",
      pay_online: true,
    });
    trackEcommerceEvent("view_item", {
      value: offer.salePrice,
      items: [
        {
          item_id: offer.productId,
          item_name: offer.title,
          item_variant: offer.format,
          item_category: "pay",
          price: offer.salePrice,
          quantity: 1,
        },
      ],
      pay_online: true,
      pickup_sales_channel: "osw_yard",
      source: "offer-detail",
    });
    return () => window.clearTimeout(addedTimer.current);
  }, [offer.productId, offer.slug, offer.title]);
  const add = () => {
    addDeal(offer);
    setJustAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setJustAdded(false), 1800);
  };
  if (!detail) return <OffersIndex />;
  return (
    <main className="bundle-page bo-detail">
      <Helmet>
        <title>
          {offer.title} · {fmtDealPrice(offer.salePrice)} Pickup Bundle |
          Organic Soil Wholesale
        </title>
        <meta
          name="description"
          content={`${offer.title}: ${offer.bagLabel} for ${fmtDealPrice(offer.salePrice)} plus tax. ${detail.summary} See every included product and how to use it. Phoenix yard pickup.`}
        />
        <link
          rel="canonical"
          href={`https://organicsoilwholesale.com/offers/${offer.slug}`}
        />
      </Helmet>
      <div className="bo-shell">
        <nav aria-label="Breadcrumb" className="bo-breadcrumb">
          <Link href="/offers">
            <ArrowLeft size={16} aria-hidden="true" /> All deals
          </Link>
        </nav>
        <section
          className="bo-detail-hero"
          aria-labelledby="bundle-detail-heading"
        >
          <div className="bo-detail-intro">
            <p className="bo-offer-meta">{offer.bagLabel} · {offer.volumeLabel} · Phoenix pickup</p>
            <h1 id="bundle-detail-heading">
              {offer.title}
            </h1>
            <p className="bo-lead">{detail.summary}</p>
            <div className="bo-offer-price">
              <strong>{fmtDealPrice(offer.salePrice)}</strong>
              <small>+ tax</small>
              <s aria-label={`Individual bags ${comparisonPrice(bundleComparison[offer.slug])}`}>{comparisonPrice(bundleComparison[offer.slug])}</s>
            </div>
            <p className="bo-offer-savings">Save {comparisonPrice(bundleComparison[offer.slug] - offer.salePrice)} compared with buying the bags individually.</p>
            <button
              type="button"
              className="bo-button bo-hero-add"
              onClick={add}
            >
              <ShoppingBag size={19} aria-hidden="true" />
              {justAdded
                ? "Added to your order"
                : "Add bundle to order"}
            </button>
            <a className="bo-offer-contents-link" href="#bundle-contents-heading">See what’s included <ArrowRight size={15} aria-hidden="true" /></a>
          </div>
          <div className="bo-detail-gallery">
            <img className="bo-offer-hero-photo" src={bundleGroupImages[offer.slug]} alt={`Bagged products in the ${offer.title} bundle`} fetchPriority="high" decoding="async" />
          </div>
        </section>
        <section
          className="bo-contents-section"
          aria-labelledby="bundle-contents-heading"
        >
          <h2 id="bundle-contents-heading">What’s included</h2>
          <div className="bo-offer-contents">
            <div className="bo-offer-products">
            {products.map((product) => {
              const usage = getBundleUsage(offer.items.find((item) => item.href === product.href));
              return <article className="bo-offer-product" key={product.productKey}>
                <img src={bagImage(product)} alt={`${product.name} bag`} loading="lazy" />
                <div>
                  <h3>{product.name}</h3>
                  <span>{amountFor(offer, product).replace(" included", "")}</span>
                  <p>{usage?.purpose || product.purpose}</p>
                  {usage && <details className="bo-offer-use"><summary>How to use it</summary>
                    <small>{usage.perBag}</small>
                    <strong>{usage.coverage}</strong>
                    <p>{usage.application}</p>
                    <p>{usage.nextUse}</p>
                  </details>}
                  <Link href={product.href}>Product details <ArrowRight size={15} aria-hidden="true" /></Link>
                </div>
              </article>;
            })}
          </div>
            <BundleVideo slug={offer.slug} title={offer.title} />
          </div>
          <details className="bo-offer-coverage">
            <summary>How much ground will this cover?</summary>
            <p>{detail.coverageNote}</p>
            <p>Volume is measured before settling. A 4×8 bed is 32 square feet. The bundle contains growing materials only.</p>
          </details>
        </section>
        <section
          className="bo-pickup-section"
          aria-labelledby="bundle-pickup-heading"
        >
          <div>
            <h2 id="bundle-pickup-heading">Pickup details</h2>
            <p>
              Choose your pickup time at checkout and bring your confirmation to the yard.
            </p>
            <PickupDetails />
          </div>
          <div className="bo-pickup-order">
            <span className="bo-eyebrow">{offer.title}</span>
            <strong>
              {fmtDealPrice(offer.salePrice)} <small>+ tax</small>
            </strong>
            <p>
              {offer.bagLabel} · {offer.volumeLabel}
            </p>
            <button type="button" className="bo-button" onClick={add}>
              <ShoppingBag size={18} aria-hidden="true" />
              {justAdded ? "Added to your order" : "Add bundle to order"}
            </button>
            <a
              href={CUSTOMER_SUPPORT_PHONE_TEL}
              className="bo-help-link"
              aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
              data-official-support-phone="true"
            >
              <Phone size={16} aria-hidden="true" />
              Questions?{" "}
              <span data-official-support-phone-text="true">
                {CUSTOMER_SUPPORT_PHONE_DISPLAY}
              </span>
            </a>
          </div>
        </section>
        <section
          className="bo-faq-section"
          aria-labelledby="bundle-faq-heading"
        >
          <div>
            <h2 id="bundle-faq-heading">Common questions</h2>
          </div>
          <div className="bo-faq-list">
            {detail.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className="bo-other-bundles"
          aria-labelledby="other-bundles-heading"
        >
          <div className="bo-section-heading">
            <div>
              <h2 id="other-bundles-heading">Other bundles</h2>
            </div>
            <Link href="/offers">
              See all deals <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="bo-alternative-grid">
            {PROMO_BUNDLES.filter(
              (other) => other.productId !== offer.productId,
            ).map((other) => (
              <Link
                href={`/offers/${other.slug}`}
                className="bo-alternative"
                key={other.slug}
              >
                <div>
                  <span>{other.bagLabel} · Phoenix pickup</span>
                  <h3>{other.title}</h3>
                  <p>{getBundleDetails(other.slug)?.summary}</p>
                </div>
                <strong>
                  {fmtDealPrice(other.salePrice)}
                  <ArrowRight size={18} aria-hidden="true" />
                </strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <div className="bo-mobile-order">
        <div>
          <strong>{fmtDealPrice(offer.salePrice)}</strong>
          <span>{offer.title} · + tax</span>
        </div>
        <button type="button" className="bo-button" onClick={add}>
          <ShoppingBag size={18} aria-hidden="true" />
          {justAdded ? "Added" : "Add bundle"}
        </button>
      </div>
    </main>
  );
}
