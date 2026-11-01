import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Award, Leaf, Zap, Shield, Store, Package, Truck, Phone } from "lucide-react";
import { useState, useEffect } from "react";
import { productsData } from "@/data/productData";
import ProductShowcase from "@/components/ProductShowcase";
import SEO from "@/components/layout/SEO";
import { OptimizedImage } from "@/components/OptimizedImage";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";

const Nurseries = () => {
  const [, setLocation] = useLocation();
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    interest: "Worm Castings",
    notes: "",
  });
  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  useEffect(() => {
    const nurseryProducts = productsData.filter((product) => {
      const name = product.name.toLowerCase();
      return name.includes("worm") || name.includes("simon") || name.includes("plantpal") || name.includes("propagrow") || name.includes("plugboost") || name.includes("superbooster");
    });
    setProducts(nurseryProducts);
    setIsLoading(false);
  }, []);

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
          notes: `Source: Nurseries page\nCompany: ${formData.company}\nInterested in: ${formData.interest}\n\n${formData.notes}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setFormStatus("success");
      setFormData({ name: "", company: "", email: "", phone: "", interest: "Worm Castings", notes: "" });
    } catch {
      setFormStatus("error");
    }
  };

  return (
    <>
      <SEO
        title="Worm Castings for Nurseries & Garden Centers - Wholesale"
        description="Retail-ready worm castings at $6.45/bag wholesale. 144 bags per pallet, 64% margin. Free Phoenix metro delivery over $500. Arizona-produced, OMRI listed."
        keywords="wholesale worm castings, nursery soil supplier, garden center wholesale, retail worm castings bags, organic nursery supplies, worm castings distributor Arizona, nursery soil amendments"
        canonical="https://organicsoilwholesale.com/nurseries"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Mikey's Worm Poop - Wholesale Worm Castings",
          "description": "Premium Arizona-produced worm castings in retail-ready 9lb bags for nurseries and garden centers",
          "brand": { "@type": "Brand", "name": "Soil Seed & Water" },
          "offers": {
            "@type": "Offer",
            "price": "6.45",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": "6.45",
              "priceCurrency": "USD",
              "unitText": "bag",
              "referenceQuantity": { "@type": "QuantitativeValue", "value": "144", "unitText": "bag" },
            },
          },
        }}
      />

      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
        {/* Hero Section */}
        <div className="bg-green-800 text-white py-12 sm:py-20 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 right-0 h-20 bg-white/10"></div>
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-black/10"></div>
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="flex flex-col lg:flex-row gap-10 items-center">
              {/* Image */}
              <div className="w-full lg:w-1/2 flex justify-center">
                <div className="bg-white rounded-3xl shadow-2xl p-1 w-full max-w-lg relative">
                  <div className="rounded-2xl overflow-hidden bg-gray-50">
                    <OptimizedImage
                      src="worm-castings.jpg"
                      alt="Mikey's Worm Poop - Premium Worm Castings for Nurseries"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 rounded-full shadow-lg transform rotate-12">
                    <span className="text-sm font-bold">SPRING HOT SELLER</span>
                  </div>
                </div>
              </div>

              {/* Text */}
              <div className="w-full lg:w-1/2">
                <div className="inline-flex items-center bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                  FOR NURSERIES & GARDEN CENTERS
                </div>
                <h1 className="text-3xl sm:text-5xl font-bold mb-4 leading-tight">
                  Worm Castings That Sell Themselves
                </h1>
                <p className="text-lg text-green-100 mb-6 max-w-xl">
                  Retail-ready 9 lb bags with strong shelf appeal. Arizona-produced, OMRI listed.
                  Your customers are asking for worm castings this spring.
                </p>

                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">$6.45</div>
                      <div className="text-xs text-green-200">Your Cost / Bag</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">$18.10</div>
                      <div className="text-xs text-green-200">MSRP</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">64%</div>
                      <div className="text-xs text-green-200">Your Margin</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    size="lg"
                    className="bg-white text-green-800 hover:bg-gray-100 font-bold text-lg px-8 shadow-lg"
                    onClick={() => document.getElementById("nursery-form")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Get Wholesale Pricing
                  </Button>
                  <a href={CUSTOMER_SUPPORT_PHONE_TEL}>
                    <Button
                      size="lg"
                      className="bg-amber-500 text-white hover:bg-amber-600 font-bold text-lg px-8 w-full shadow-lg"
                    >
                      <Phone className="h-5 w-5 mr-2" />
                      {CUSTOMER_SUPPORT_PHONE_DISPLAY}
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Certifications */}
        <section className="py-4 sm:py-6 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-0">Certified By</h3>
              <div className="flex items-center gap-2 sm:gap-4">
                <OptimizedImage src="omri-logo.png" alt="OMRI Certified" className="h-8 sm:h-12 w-auto" />
                <OptimizedImage src="uscc-logo.png" alt="USCC Certified" className="h-8 sm:h-12 w-auto" />
                <OptimizedImage src="made-in-usa.png" alt="Made in USA" className="h-8 sm:h-12 w-auto" />
              </div>
            </div>
          </div>
        </section>

        {/* Why Nurseries Choose Us */}
        <section className="py-10 sm:py-16 bg-white">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">Why Nurseries Choose Soil Seed & Water</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              <div className="bg-gray-50 p-6 rounded-xl text-center">
                <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-3">
                  <Store className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Retail-Ready Packaging</h3>
                <p className="text-sm text-gray-600">Eye-catching 9 lb bags designed to sell off the shelf. No repackaging needed.</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl text-center">
                <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-3">
                  <Zap className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">64% Profit Margin</h3>
                <p className="text-sm text-gray-600">$6.45 wholesale, $18.10 MSRP. One of the highest-margin products on your shelf.</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl text-center">
                <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-3">
                  <Truck className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Free Local Delivery</h3>
                <p className="text-sm text-gray-600">Free Phoenix metro delivery on orders over $500. Next-day available.</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl text-center">
                <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-3">
                  <Award className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Arizona Produced</h3>
                <p className="text-sm text-gray-600">Locally made in Phoenix. Customers love buying local, especially for organics.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Quick Reference */}
        <section className="py-10 sm:py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">Nursery Pricing</h2>
            <p className="text-gray-600 text-center mb-8">Top products for nurseries and garden centers</p>
            <div className="max-w-4xl mx-auto overflow-x-auto">
              <table className="w-full text-sm bg-white rounded-xl overflow-hidden shadow-sm">
                <thead>
                  <tr className="bg-green-800 text-white">
                    <th className="text-left p-4 font-medium">Product</th>
                    <th className="text-right p-4 font-medium">MSRP</th>
                    <th className="text-right p-4 font-medium">Your Cost</th>
                    <th className="text-right p-4 font-medium">Per Pallet</th>
                    <th className="text-right p-4 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-amber-50 border-b border-amber-100">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">Mikey's Worm Poop</div>
                      <div className="text-xs text-gray-500">9 lb bags, 144/pallet</div>
                    </td>
                    <td className="p-4 text-right text-gray-500">$18.10</td>
                    <td className="p-4 text-right font-bold text-green-700">$6.45</td>
                    <td className="p-4 text-right text-gray-700">$928.80</td>
                    <td className="p-4 text-right font-bold text-green-700">64%</td>
                  </tr>
                  <tr className="bg-white border-b border-gray-100">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">Simon's Gold Compost</div>
                      <div className="text-xs text-gray-500">9 lb bags, 144/pallet</div>
                    </td>
                    <td className="p-4 text-right text-gray-500">$6.95</td>
                    <td className="p-4 text-right font-bold text-green-700">$4.45</td>
                    <td className="p-4 text-right text-gray-700">$640.80</td>
                    <td className="p-4 text-right font-bold text-green-700">36%</td>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">PlantPal Plus</div>
                      <div className="text-xs text-gray-500">1.5 cu ft bags, 30/pallet</div>
                    </td>
                    <td className="p-4 text-right text-gray-500">$10.99</td>
                    <td className="p-4 text-right font-bold text-green-700">$5.50</td>
                    <td className="p-4 text-right text-gray-700">$165.00</td>
                    <td className="p-4 text-right font-bold text-green-700">50%</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">SuperBooster</div>
                      <div className="text-xs text-gray-500">9 lb bags, 144/pallet</div>
                    </td>
                    <td className="p-4 text-right text-gray-500">$24.95</td>
                    <td className="p-4 text-right font-bold text-green-700">$12.48</td>
                    <td className="p-4 text-right text-gray-700">$1,796.40</td>
                    <td className="p-4 text-right font-bold text-green-700">50%</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-500 text-center mt-3">
                1 pallet min or $250 mixed. Net 30 for approved accounts. Free delivery over $500.
                <button onClick={() => setLocation("/wholesale")} className="text-green-700 underline ml-1">View full pricing</button>
              </p>
            </div>
          </div>
        </section>

        {/* Lead Capture Form */}
        <section id="nursery-form" className="py-10 sm:py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Start Carrying Our Products</h2>
                <p className="text-gray-600">Fill out the form and we'll send you a sample or get you set up same day.</p>
              </div>

              {formStatus === "success" ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <div className="text-green-600 text-4xl mb-3">&#10003;</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h3>
                  <p className="text-gray-600">We'll contact you within 24 hours to get you set up.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="Nursery or garden center name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="you@nursery.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Interested In</label>
                    <select
                      value={formData.interest}
                      onChange={(e) => setFormData({ ...formData, interest: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                    >
                      <option value="Worm Castings">Worm Castings (Mikey's Worm Poop)</option>
                      <option value="Compost">Compost (Simon's Gold)</option>
                      <option value="Nursery Mix">Nursery Mix (PlantPal Plus)</option>
                      <option value="Soil Amendments">Soil Amendments (Specialty Blends)</option>
                      <option value="Multiple Products">Multiple Products</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="How many locations? Estimated monthly volume? Anything else..."
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-green-700 hover:bg-green-800 text-white font-bold text-lg py-6"
                    disabled={formStatus === "submitting"}
                  >
                    {formStatus === "submitting" ? "Submitting..." : "Request Wholesale Account"}
                  </Button>
                  {formStatus === "error" && (
                    <p className="text-red-600 text-sm text-center">Something went wrong. Please call us at {CUSTOMER_SUPPORT_PHONE_DISPLAY}.</p>
                  )}
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Product Showcase */}
        <section className="py-10 sm:py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">More Products for Your Nursery</h2>
            <ProductShowcase products={products} loading={isLoading} initialCategory="all" />
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 bg-green-800 text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Stock Worm Castings?</h2>
            <p className="text-green-100 mb-6 max-w-xl mx-auto">
              Call us for same-day quotes. Most orders deliver next business day in the Phoenix metro.
            </p>
            <a href={CUSTOMER_SUPPORT_PHONE_TEL}>
              <Button size="lg" className="bg-white text-green-800 hover:bg-green-50 font-bold text-lg px-8">
                <Phone className="h-5 w-5 mr-2" />
                {CUSTOMER_SUPPORT_PHONE_DISPLAY}
              </Button>
            </a>
          </div>
        </section>
      </div>
    </>
  );
};

export default Nurseries;
