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
  Check,
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
        {groupImage.free && <span className="bo-free-badge">{groupImage.free}</span>}
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
          <span className="bo-eyebrow">More growing. Better value.</span>
          <h1>Garden bundles &amp; deals.</h1>
          <p>
            Choose the materials your garden needs. Get a clear bundle price,
            real product details and local help along the way.
          </p>
        </header>
        <section
          className="bo-index-bundles"
          aria-labelledby="pickup-bundles-heading"
        >
          <div className="bo-section-heading">
            <div>
              <span className="bo-eyebrow">
                Garden bundles · Arizona
              </span>
              <h2 id="pickup-bundles-heading">Find your garden’s next step.</h2>
            </div>
            <p>
              Choose a complete raised bed or a pickup bundle of growing materials.
            </p>
          </div>
          <p className="bo-comparison-note">Pricing preview: individual bag totals use $14.95 for dairy compost and $34.90 for worm castings.</p>
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
                <div className="bo-card-price"><span>4 × 8 ft · 2 ft deep</span><b>Save $463</b></div>
                <h3>Raised Garden Bed Bundle</h3>
                <p>A heavy-duty raised bed with soil, mulch and amendments.</p>
                <div className="bo-card-total"><strong>$945.43</strong><span>+ tax <span className="bo-card-value">Bundle value <s>$1,408.43</s></span></span></div>
                <p className="bo-bed-card-note">Free Arizona delivery in November 2026. A personal offer link is required to pay. Image is an illustration.</p>
              </div>
              <a href="/garden-bed-offer.html" className="bo-card-link" aria-label="Explore the Raised Garden Bed Bundle" onClick={() => trackEvent("Garden Bed Offer Clicked", { source: "offers-index" })} />
            </article>
            {PROMO_BUNDLES.map((deal) => (
              <article className="bo-deal-card" key={deal.slug}>
                <BundleVisual offer={deal} compact />
                <div className="bo-deal-card-copy">
                  <div className="bo-card-price">
                    <span>{deal.bagLabel}</span>
                  </div>
                  <h3>{deal.title}</h3>
                  <p>{getBundleDetails(deal.slug)?.summary}</p>
                  <div className="bo-price-comparison" aria-label={`Individual bag total ${comparisonPrice(bundleComparison[deal.slug])}, bundle price ${fmtDealPrice(deal.salePrice)} plus tax`}>
                    <span className="bo-was-price"><small>Individual bags</small><s>{comparisonPrice(bundleComparison[deal.slug])}</s></span>
                    <ArrowRight size={19} aria-hidden="true" />
                    <span className="bo-now-price"><small>Bundle price</small><strong>{fmtDealPrice(deal.salePrice)}</strong><span>+ tax</span></span>
                    <b className="bo-price-saving">You save <strong>{comparisonPrice(bundleComparison[deal.slug] - deal.salePrice)}</strong></b>
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
          <span aria-hidden="true">/</span>
          <span>{offer.title}</span>
        </nav>
        <section
          className="bo-detail-hero"
          aria-labelledby="bundle-detail-heading"
        >
          <div className="bo-detail-intro">
            <span className="bo-eyebrow">
              {offer.bagLabel} · Phoenix pickup
            </span>
            <h1 id="bundle-detail-heading">
              {offer.title}
            </h1>
            <p className="bo-lead">{detail.summary}</p>
            <div className="bo-refresh-deal">
              <div><span>Individual bags</span><s>{comparisonPrice(bundleComparison[offer.slug])}</s></div>
              <ArrowRight size={20} aria-hidden="true" />
              <div><span>Bundle price</span><strong>{fmtDealPrice(offer.salePrice)} <small>+ tax</small></strong></div>
              <b>You save {comparisonPrice(bundleComparison[offer.slug] - offer.salePrice)}</b>
            </div>
            <p className="bo-comparison-note">Pricing preview based on $14.95 dairy compost and $34.90 worm castings bags.</p>
            <button
              type="button"
              className="bo-button bo-hero-add"
              onClick={add}
            >
              <ShoppingBag size={19} aria-hidden="true" />
              {justAdded
                ? "Added to your order"
                : `Add bundle to order · ${fmtDealPrice(offer.salePrice)}`}
            </button>
            <p className="bo-order-note">
              Pay online. Pick up at our Phoenix yard. Bed frame not included.
            </p>
            <div className="bo-included-summary">
              <div className="bo-included-heading"><strong>Included in your bundle</strong><span>{offer.volumeLabel}</span></div>
              <ul>{products.map((product) => (
                <li key={product.productKey}><span>{product.name}</span><strong>{amountFor(offer, product).replace(" included", "")}</strong></li>
              ))}</ul>
              <a href="#bundle-contents-heading">Explore the products <ArrowRight size={14} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="bo-detail-gallery">
            <BundleVideo slug={offer.slug} title={offer.title} />
            <div className="bo-refresh-photo">
              <img src={bundleGroupImages[offer.slug]} alt={`${offer.title} bundle of bagged garden materials`} loading="lazy" decoding="async" />
              {offer.slug === "garden-refresh" && <span>3 dairy compost bags free</span>}
              {offer.slug === "garden-refresh-plus" && <span>3 mulch bags free</span>}
            </div>
          </div>
        </section>
        <section
          className="bo-contents-section"
          aria-labelledby="bundle-contents-heading"
        >
          <div className="bo-section-heading">
            <div>
              <span className="bo-eyebrow">Every bag has a job</span>
              <h2 id="bundle-contents-heading">What’s in your bundle.</h2>
            </div>
            <p>What you get and how each material helps your garden.</p>
          </div>
          <div className={`bo-refresh-products bo-refresh-products-${products.length}`}>
            {products.map((product) => {
              const usage = getBundleUsage(offer.items.find((item) => item.href === product.href));
              return <article className="bo-refresh-product" key={product.productKey}>
                <img src={bagImage(product)} alt={`${product.name} bag`} loading="lazy" />
                <div>
                  <span>{amountFor(offer, product).replace(" included", "")}</span>
                  <h3>{product.name}</h3>
                  <p>{usage?.purpose || product.purpose}</p>
                  {usage && <div className="bo-product-usage">
                    <small>{usage.perBag}</small>
                    <strong>{usage.coverage}</strong>
                    <p>{usage.application}</p>
                    <p className="bo-product-topup">{usage.nextUse}</p>
                  </div>}
                  <Link href={product.href}>Product details <ArrowRight size={15} aria-hidden="true" /></Link>
                </div>
              </article>;
            })}
          </div>
          <p className="bo-usage-footnote">Coverage is per product, before settling. A 4×8 bed is 32 sq ft. Depth and plant needs vary; bag weights vary with moisture.</p>
          <div className="bo-coverage-note">
            <Leaf size={23} aria-hidden="true" />
            <div>
              <strong>Plan the fill. Count mulch separately.</strong>
              <p>{detail.coverageNote}</p>
              <p>
                Included material volume: <strong>{offer.volumeLabel}</strong>.
                Bed frame, plants, irrigation and tools are not included.
              </p>
            </div>
          </div>
        </section>
        <section
          className="bo-pickup-section"
          aria-labelledby="bundle-pickup-heading"
        >
          <div>
            <span className="bo-eyebrow">
              Order here. We’ll see you at the yard.
            </span>
            <h2 id="bundle-pickup-heading">Simple local pickup.</h2>
            <p>
              Add the bundle to your order, check out online and bring your
              confirmation when you pick up. You can add other bags from
              Products to the same order.
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
            <span className="bo-eyebrow">A few helpful answers</span>
            <h2 id="bundle-faq-heading">Before you get growing.</h2>
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
              <span className="bo-eyebrow">A different project?</span>
              <h2 id="other-bundles-heading">Find the right starting point.</h2>
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
