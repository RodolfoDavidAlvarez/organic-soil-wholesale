import { useState } from "react";
import { Phone, Mail, FileDown, Package, Truck, Award } from "lucide-react";
import SEO from "@/components/layout/SEO";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/OptimizedImage";
import { HOURS_LABEL } from "@shared/pickupSchedule.js";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";

const CORE_FOUR = [
  {
    name: "PlantPal Plus",
    size: "1.5 cu ft bag",
    msrp: "$10.99",
    cost: "$5.50",
    image: "/images/bundles/plantpal-15cf-illustration-640.webp",
  },
  {
    name: "Nature's Blanket Premium",
    size: "2 cu ft bag",
    msrp: "$10.99",
    cost: "$5.50",
    image: "/images/optimized/natures-blanket-bag-studio.jpg",
  },
  {
    name: "Mikey's Worm Poop",
    size: "9 lb bag",
    msrp: "$18.10",
    cost: "$9.05",
    image: "/images/optimized/mikeys-worm-poop-bag-context.jpg",
  },
  {
    name: "Simon's Gold",
    size: "9 lb bag",
    msrp: "$6.95",
    cost: "$6.23",
    image: "/images/optimized/simons-gold-bag-context.jpg",
  },
] as const;

const OTHER_CATEGORIES = [
  "Potting soils & nursery mixes",
  "Specialty soil amendments",
  "Bulk compost & worm castings (ton / truckload)",
  "Turf & landscape blends",
] as const;

const PRICING_PDF = "/documents/distributors/Distributor-Pricing-Sheet.pdf";

const Distributors = () => {
  const [formData, setFormData] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus("submitting");
    try {
      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          notes: `Company: ${formData.company}\nSource: Distributors page\nStore type / notes: ${formData.notes || "None"}`,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setFormStatus("success");
      setFormData({ name: "", company: "", email: "", phone: "", notes: "" });
    } catch {
      setFormStatus("error");
    }
  };

  return (
    <>
      <SEO
        title="Distributor Program — Retail MSRP & 50% Pricing"
        description="Organic bagged soil, mulch, compost, and worm castings for hardware stores, garden centers, and retail partners. Arizona-made. Distributor cost is 50% of suggested retail (MSRP)."
        keywords="organic soil distributor, garden center supplier Arizona, hardware store soil wholesale, mulch distributor Phoenix"
        canonical="https://organicsoilwholesale.com/distributors"
      />

      <div className="min-h-screen bg-[#fdfbf7]">
        {/* Hero */}
        <section className="bg-[#264027] text-white">
          <div className="container mx-auto px-4 py-14 sm:py-20">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-[#b38a58] text-sm font-semibold tracking-widest uppercase mb-3">
                Retail partner program
              </p>
              <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
                Distributor pricing for stores &amp; garden centers
              </h1>
              <p className="text-lg text-green-100/95 mb-8 max-w-2xl mx-auto">
                Four core bagged SKUs ready for your floor. Distributor cost is <strong className="text-white">50% of MSRP</strong> (suggested retail). Arizona-made, OMRI-listed inputs.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-[#264027] hover:bg-green-50 font-bold text-base px-8 h-12"
                  asChild
                >
                  <a href={PRICING_PDF} target="_blank" rel="noopener noreferrer">
                    <FileDown className="mr-2 h-5 w-5" />
                    Download pricing sheet (PDF)
                  </a>
                </Button>
                <Button
                  size="lg"
                  className="bg-[#b38a58] text-white hover:bg-[#9a7648] font-bold text-base px-8 h-12 border-0"
                  onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Request account setup
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Quick facts */}
        <section className="py-6 bg-white border-b border-stone-200">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center max-w-4xl mx-auto">
              <div className="flex flex-col items-center gap-2">
                <Package className="h-6 w-6 text-[#264027]" />
                <div className="text-sm font-medium text-stone-700">Pallet MOQ by SKU</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Truck className="h-6 w-6 text-[#264027]" />
                <div className="text-sm font-medium text-stone-700">Yard pickup · delivery available</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Award className="h-6 w-6 text-[#264027]" />
                <div className="text-sm font-medium text-stone-700">OMRI · US Compost Council</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Phone className="h-6 w-6 text-[#264027]" />
                <div className="text-sm font-medium text-stone-700">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Core four */}
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#264027] mb-2">Core four products</h2>
              <p className="text-stone-600 max-w-xl mx-auto">
                <strong>MSRP</strong> = suggested shelf price for your customers. <strong>Your cost</strong> = 50% of MSRP.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {CORE_FOUR.map((p) => (
                <div key={p.name} className="bg-white rounded-xl border border-stone-200 p-5 flex gap-4 shadow-sm">
                  <OptimizedImage
                    src={p.image}
                    alt={p.name}
                    className="w-20 h-20 object-contain rounded-lg bg-stone-50 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <h3 className="font-bold text-[#264027]">{p.name}</h3>
                    <p className="text-sm text-stone-500 mb-2">{p.size}</p>
                    <div className="flex gap-4 text-sm">
                      <span><span className="text-stone-500">MSRP </span><strong>{p.msrp}</strong></span>
                      <span><span className="text-stone-500">Your cost </span><strong className="text-[#264027]">{p.cost}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center mt-8">
              <a href={PRICING_PDF} className="text-[#264027] font-semibold underline underline-offset-2" target="_blank" rel="noopener noreferrer">
                Full pricing sheet (PDF) →
              </a>
            </p>
          </div>
        </section>

        {/* More lines */}
        <section className="py-10 bg-white border-y border-stone-200">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h2 className="text-xl font-bold text-[#264027] mb-3">Additional product lines</h2>
            <p className="text-stone-600 mb-4">
              We also supply potting soils, specialty amendments, and bulk material. Pricing is quoted separately — contact us for the current distributor rate.
            </p>
            <ul className="text-sm text-stone-700 space-y-1">
              {OTHER_CATEGORIES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="py-12 sm:py-16">
          <div className="container mx-auto px-4 max-w-lg">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-[#264027] mb-2">Become a distributor</h2>
              <p className="text-stone-600 text-sm">
                For hardware stores, garden centers, and retail partners reselling on the floor — not home gardeners or landscapers (separate programs).
              </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8 text-sm">
              <a href={CUSTOMER_SUPPORT_PHONE_TEL} className="flex items-center justify-center gap-2 text-[#264027] font-medium">
                <Phone className="h-4 w-4" /> {CUSTOMER_SUPPORT_PHONE_DISPLAY}
              </a>
              <a href="mailto:info@soilseedandwater.com" className="flex items-center justify-center gap-2 text-[#264027] font-medium">
                <Mail className="h-4 w-4" /> info@soilseedandwater.com
              </a>
            </div>

            {formStatus === "success" ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-stone-700">
                Thank you — we will send pricing and next steps shortly.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
                <input
                  required
                  placeholder="Your name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg"
                />
                <input
                  placeholder="Store / company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Email *"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg"
                />
                <input
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg"
                />
                <textarea
                  placeholder="Store type, locations, estimated volume"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg"
                />
                <Button type="submit" disabled={formStatus === "submitting"} className="w-full bg-[#264027] hover:bg-[#1f3320] h-12 font-bold">
                  {formStatus === "submitting" ? "Sending…" : "Submit inquiry"}
                </Button>
                {formStatus === "error" && <p className="text-red-600 text-sm text-center">Something went wrong. Please call us.</p>}
              </form>
            )}
            <p className="text-xs text-stone-500 text-center mt-6">
              Yard: 1634 N 19th Ave, Phoenix AZ 85009 · {HOURS_LABEL}
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default Distributors;
