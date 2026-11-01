import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Award, Leaf, Truck, Phone, Package, DollarSign, Clock, ChevronDown } from "lucide-react";
import { useState } from "react";
import SEO from "@/components/layout/SEO";
import { OptimizedImage } from "@/components/OptimizedImage";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";

const Wholesale = () => {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [orderItems, setOrderItems] = useState<{ product: string; qty: string }[]>([
    { product: "Mikey's Worm Poop (9lb, 144/pallet)", qty: "1" },
  ]);
  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const productOptions = [
    "Mikey's Worm Poop (9lb, 144/pallet)",
    "Mikey's Worm Poop (1CF, 50/pallet)",
    "Simon's Gold Compost (9lb, 144/pallet)",
    "Simon's Gold Compost (1CF, 50/pallet)",
    "Simon's Gold Loose (per ton)",
    "Turf Daddy Blend (9lb, 144/pallet)",
    "Turf Daddy Blend (1CF, 50/pallet)",
    "Soil Craft Garden Blend (1.5CF, 30/pallet)",
    "PlantPal Potting Mix (1.5CF, 30/pallet)",
    "Nature's Blanket Mulch (2CF, 25/pallet)",
    "Nature's Blanket Premium (2CF, 25/pallet)",
    "Amazonian Dark Earth (9lb, 144/pallet)",
    "Artemis Root Boost (9lb, 144/pallet)",
    "SuperBooster (9lb, 144/pallet)",
    "Cultivator's Rose Blend (9lb, 144/pallet)",
    "Other (specify in notes)",
  ];

  const addOrderItem = () => {
    setOrderItems([...orderItems, { product: productOptions[0], qty: "1" }]);
  };

  const removeOrderItem = (idx: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== idx));
    }
  };

  const updateOrderItem = (idx: number, field: "product" | "qty", value: string) => {
    const updated = [...orderItems];
    updated[idx][field] = value;
    setOrderItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus("submitting");

    const orderSummary = orderItems
      .map((item) => `${item.qty} pallet(s) - ${item.product}`)
      .join("\n");

    try {
      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          notes: `Company: ${formData.company}\nSource: Wholesale Order Form\n\nORDER:\n${orderSummary}\n\nNotes: ${formData.notes || "None"}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setFormStatus("success");
      setFormData({ name: "", company: "", email: "", phone: "", notes: "" });
      setOrderItems([{ product: productOptions[0], qty: "1" }]);
    } catch {
      setFormStatus("error");
    }
  };

  const pricingData: Record<string, {
    title: string;
    subtitle: string;
    columns: string[];
    products: { name: string; desc: string; popular?: boolean; cols: string[] }[];
  }> = {
    baggedSoils: {
      title: "Bagged Soils",
      subtitle: "1 Cubic Foot per bag | 50 bags per pallet",
      columns: ["MSRP", "Distributor", "Pallet (50)", "Tote (2.2 CY)", "Truckload (22)"],
      products: [
        { name: "Soil Craft Garden & Planter Blend", desc: "Organic Potting Soil", popular: true, cols: ["$15.99", "$8.00", "$399.75", "$359.78", "$7,123.55"] },
        { name: "PlantPal Plus", desc: "All-Stage Potting Mix", cols: ["$10.99", "$5.50", "$274.75", "$247.28", "$4,896.05"] },
        { name: "PropaGrow", desc: "Root Boosting Propagation Mix", cols: ["$10.99", "$5.50", "$274.75", "$247.28", "$4,896.05"] },
        { name: "PlugBoost", desc: "Seed Starter Mix", cols: ["$10.99", "$5.50", "$274.75", "$247.28", "$4,896.05"] },
      ],
    },
    mulch: {
      title: "Mulch",
      subtitle: "2 Cubic Feet per bag | 25 bags per pallet",
      columns: ["MSRP", "Distributor", "Pallet (25)", "Tote (2.2 CY)", "Truckload (22)"],
      products: [
        { name: "Nature's Blanket", desc: "Clean Wood Fiber Mulch", cols: ["$8.99", "$4.50", "$112.38", "$112.38", "$2,224.72"] },
        { name: "Nature's Blanket Premium", desc: "Enhanced Mulch with Dairy Compost", cols: ["$10.99", "$5.50", "$137.50", "$137.50", "$2,722.50"] },
      ],
    },
    amendments: {
      title: "Soil Amendments",
      subtitle: "9 lb bags | 144 per pallet | 1 CF bags | 50 per pallet",
      columns: ["9lb MSRP", "9lb Dist.", "Pallet (144)", "1CF MSRP", "1CF Dist.", "Tote"],
      products: [
        { name: "Simon's Gold", desc: "All Natural Dairy Compost", popular: true, cols: ["$6.95", "$4.45", "$640.80", "$14.95", "$6.45", "$149.00"] },
        { name: "Mikey's Worm Poop", desc: "All Natural Worm Castings", cols: ["$18.10", "$6.45", "$928.80", "$19.70", "$9.85", "$399.00"] },
        { name: "Amazonian Dark Earth", desc: "Premium Biochar Soil Conditioner", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Artemis Root Boost Blend", desc: "Mycorrhizal Root Stimulator", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Oasis Blend", desc: "Palm & Date Tree Specialty", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Pomona Blend", desc: "Fruit Tree Specialty Amendment", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Seriokai's Secret Blend", desc: "Citrus & Avocado Specialty", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Turf Daddy Blend", desc: "Turf and Grass Blend", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
        { name: "Bacchus Blend", desc: "Grape & Vineyard Specialty", cols: ["$20.58", "$7.35", "$1,058.40", "$24.90", "$12.45", "$459.00"] },
      ],
    },
    concentrated: {
      title: "Concentrated Amendments",
      subtitle: "High-potency formulas | 144 per pallet",
      columns: ["MSRP", "Distributor", "Pallet (144)", "1CF MSRP", "1CF Dist.", "Tote"],
      products: [
        { name: "Cultivator's Rose Blend", desc: "Rose & Flowering Plant Formula", cols: ["$44.95", "$22.48", "$3,236.40", "$155.00", "$77.50", "$4,188.00"] },
        { name: "SuperBooster", desc: "Organic Vegetable Booster Concentrate", cols: ["$24.95", "$12.48", "$1,796.40", "$34.95", "$17.48", "$1,290.90"] },
      ],
    },
    bulk: {
      title: "Bulk / Loose Material",
      subtitle: "Material only, trucking extra",
      columns: ["Price/Ton", "Truckload (24 tons)", "Notes"],
      products: [
        { name: "Simon's Gold (Loose)", desc: "All Natural Dairy Compost", cols: ["$30.00", "$720.00", "Material only"] },
        { name: "Mikey's Worm Poop (Loose)", desc: "All Natural Worm Castings", cols: ["$175.00", "$4,200.00", "Limited availability"] },
      ],
    },
  };

  return (
    <>
      <SEO
        title="Wholesale Organic Soil Products - Phoenix Metro Delivery"
        description="Wholesale organic soil, worm castings, compost, and mulch. Distributor pricing from $4.45/bag. Free Phoenix metro delivery over $500. Net 30 terms available."
        keywords="wholesale organic soil, bulk worm castings, wholesale compost, bulk mulch Arizona, organic soil distributor, wholesale soil amendments, Phoenix soil supplier"
        canonical="https://organicsoilwholesale.com/wholesale"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Wholesale Organic Soil Products",
          "provider": {
            "@type": "Organization",
            "name": "Soil Seed & Water",
          },
          "areaServed": {
            "@type": "State",
            "name": "Arizona",
          },
          "description": "Wholesale organic soil products with distributor pricing and free Phoenix metro delivery",
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
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-3xl sm:text-5xl font-bold mb-4 leading-tight">
                Wholesale Organic Soil
              </h1>
              <p className="text-lg sm:text-xl text-green-100 mb-2">
                Phoenix Metro Delivery
              </p>
              <p className="text-base sm:text-lg text-green-200 max-w-2xl mx-auto mb-8">
                Distributor pricing on OMRI-listed soils, worm castings, compost, and mulch.
                Free delivery on orders over $500.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-green-800 hover:bg-green-50 font-bold text-lg px-8"
                  onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                >
                  View Pricing
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white/10 font-bold text-lg px-8"
                  onClick={() => document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <section className="py-6 bg-white border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="flex flex-col items-center gap-2">
                <Package className="h-6 w-6 text-green-600" />
                <div className="text-sm font-medium text-gray-700">1 Pallet Min or $250</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Truck className="h-6 w-6 text-green-600" />
                <div className="text-sm font-medium text-gray-700">Free Delivery Over $500</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Clock className="h-6 w-6 text-green-600" />
                <div className="text-sm font-medium text-gray-700">Net 30 Available</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Award className="h-6 w-6 text-green-600" />
                <div className="text-sm font-medium text-gray-700">OMRI Listed</div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Product: Mikey's Worm Poop */}
        <section className="py-10 sm:py-16 bg-gradient-to-b from-white to-green-50">
          <div className="container mx-auto px-4">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-5xl mx-auto">
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-1/2 bg-gray-50 p-4 sm:p-8 flex items-center justify-center">
                  <OptimizedImage
                    src="worm-castings.jpg"
                    alt="Mikey's Worm Poop - Premium Worm Castings"
                    className="w-full max-w-md h-auto rounded-xl"
                  />
                </div>
                <div className="lg:w-1/2 p-6 sm:p-10 flex flex-col justify-center">
                  <div className="inline-flex items-center bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-3 self-start">
                    SPRING HOT SELLER
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                    Mikey's Worm Poop
                  </h2>
                  <p className="text-gray-600 mb-4">
                    100% pure worm castings, Arizona-produced. Retail-ready 9 lb bags with strong shelf appeal.
                    Your customers are asking for worm castings this spring.
                  </p>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-gray-500">MSRP</div>
                        <div className="text-lg font-bold text-gray-900">$18.10</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Your Cost</div>
                        <div className="text-lg font-bold text-green-700">$6.45/bag</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Per Pallet (144 bags)</div>
                        <div className="text-lg font-bold text-gray-900">$928.80</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Your Margin</div>
                        <div className="text-lg font-bold text-green-700">64%</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-medium">144 bags/pallet</span>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-medium">Retail-Ready Packaging</span>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-medium">Arizona Produced</span>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-lg text-xs font-medium">OMRI Listed</span>
                  </div>

                  <Button
                    className="bg-green-700 hover:bg-green-800 text-white font-bold"
                    size="lg"
                    onClick={() => document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Order Worm Castings
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Full Pricing Table */}
        <section id="pricing" className="py-10 sm:py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Distributor Pricing</h2>
              <p className="text-gray-600">22-tote truckloads get an additional 10% discount</p>
            </div>

            <div className="max-w-6xl mx-auto space-y-4">
              {Object.entries(pricingData).map(([key, category]) => (
                <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    onClick={() => setExpandedCategory(expandedCategory === key ? null : key)}
                  >
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900">{category.title}</h3>
                      <p className="text-xs text-gray-500">{category.subtitle}</p>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform flex-shrink-0 ${expandedCategory === key ? "rotate-180" : ""}`} />
                  </button>

                  {(expandedCategory === key || expandedCategory === null) && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-green-800 text-white">
                            <th className="text-left p-3 font-medium min-w-[160px]">Product</th>
                            {category.columns.map((col, i) => (
                              <th key={i} className="text-right p-3 font-medium whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {category.products.map((product, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <div className="font-medium text-gray-900">{product.name}</div>
                                    <div className="text-xs text-gray-500">{product.desc}</div>
                                  </div>
                                  {product.popular && (
                                    <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">POPULAR</span>
                                  )}
                                </div>
                              </td>
                              {product.cols.map((val, i) => (
                                <td key={i} className={`p-3 text-right whitespace-nowrap ${i === 1 ? "font-bold text-green-700" : "text-gray-700"}`}>
                                  {val}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-sm text-gray-500 text-center mt-4">
                22-tote truckloads receive an additional 10% discount. Example: Simon's Gold Truckload = $2,950.20 | Mikey's Worm Poop Truckload = $7,900.20
              </p>
            </div>
          </div>
        </section>

        {/* Terms Section */}
        <section className="py-10 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Wholesale Terms</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <Package className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Minimum Orders</h3>
                  </div>
                  <p className="text-sm text-gray-600">1 pallet minimum or $250 mixed order. Mix and match across product lines.</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <Truck className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Delivery</h3>
                  </div>
                  <p className="text-sm text-gray-600">Free Phoenix metro delivery on orders over $500. Extended delivery available within 300 miles.</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Payment</h3>
                  </div>
                  <p className="text-sm text-gray-600">Net 30 for approved accounts. New accounts: 50% deposit. We accept cards, ACH, check, and cash.</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <Leaf className="h-5 w-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Volume Discounts</h3>
                  </div>
                  <p className="text-sm text-gray-600">22-tote truckloads get an additional 10% discount. Custom blending available for large orders.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Order Form */}
        <section id="contact-form" className="py-10 sm:py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Place a Wholesale Order</h2>
                <p className="text-gray-600">Select your products below. We'll confirm availability and delivery within hours.</p>
              </div>

              {formStatus === "success" ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <div className="text-green-600 text-4xl mb-3">&#10003;</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Order received!</h3>
                  <p className="text-gray-600">We'll call you shortly to confirm your order and schedule delivery.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Contact Info */}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="Business name"
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
                        placeholder="you@company.com"
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

                  {/* Product Selection */}
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <label className="block text-sm font-semibold text-gray-900 mb-3">What do you need?</label>
                    {orderItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <select
                          value={item.product}
                          onChange={(e) => updateOrderItem(idx, "product", e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          {productOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={item.qty}
                            onChange={(e) => updateOrderItem(idx, "qty", e.target.value)}
                            className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className="text-xs text-gray-500 whitespace-nowrap">pallet(s)</span>
                        </div>
                        {orderItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOrderItem(idx)}
                            className="text-red-400 hover:text-red-600 px-2 text-lg"
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addOrderItem}
                      className="text-green-700 text-sm font-medium hover:text-green-800 mt-1"
                    >
                      + Add another product
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (delivery address, special requests)</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Delivery address, preferred delivery date, or anything else..."
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-green-700 hover:bg-green-800 text-white font-bold text-lg py-6"
                    disabled={formStatus === "submitting"}
                  >
                    {formStatus === "submitting" ? "Submitting Order..." : "Submit Wholesale Order"}
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    We'll call to confirm availability, pricing, and delivery. No payment required now.
                  </p>
                  {formStatus === "error" && (
                    <p className="text-red-600 text-sm text-center">Something went wrong. Please call us at {CUSTOMER_SUPPORT_PHONE_DISPLAY}.</p>
                  )}
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Delivery Photos */}
        <section className="py-8 bg-white">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-3 gap-3 max-w-4xl mx-auto">
              <img src="/images/optimized/full-truckload-mixed-pallets-and-totes.jpg" alt="Mixed pallet truckload" className="rounded-xl w-full h-32 sm:h-48 object-cover" loading="lazy" />
              <img src="/images/optimized/size-category-pallet-of-50-1-cf-bags.jpg" alt="Pallet of 50 bags" className="rounded-xl w-full h-32 sm:h-48 object-cover" loading="lazy" />
              <img src="/images/optimized/truckload-bulk-delivery.jpg" alt="Bulk delivery" className="rounded-xl w-full h-32 sm:h-48 object-cover" loading="lazy" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 bg-green-800 text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Order?</h2>
            <p className="text-green-100 mb-6 max-w-xl mx-auto">
              Call us directly for same-day quotes and next-day delivery in the Phoenix metro area.
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

export default Wholesale;
