import SEO from "@/components/layout/SEO";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { Button } from "@/components/ui/button";

const FAQ = () => {
  const faqs = [
    {
      question: "Can I buy just a few bags for my garden?",
      answer: <>Yes. Shop individual bags online, choose your size and quantity, and select an available pickup or delivery option at checkout. You do not need a wholesale account to buy the products available for online payment. <Link href="/products" className="font-semibold text-primary underline">Shop soil and amendments</Link>.</>
    },
    {
      question: "Where can I pick up my order?",
      answer: "Choose an available yard at checkout. Our Phoenix yard is at 1634 N 19th Ave. Product and format determine pickup availability; loose bulk pickup in Phoenix is limited to compost and mulch. Check your order confirmation before heading over."
    },
    {
      question: "What are the minimum order quantities for wholesale?",
      answer: "For wholesale, we require a minimum of a pallet of bags (50 units depending on size or quantity). This makes it easy for customers to calculate their orders and qualify for wholesale pricing."
    },
    {
      question: "Do you offer delivery services?",
      answer: "Yes, we offer delivery services within a 300-mile radius from Phoenix or Congress, Arizona. This is calculated based on our trucking service capabilities."
    },
    {
      question: "How long does the wholesale approval process take?",
      answer: "It takes about 1-2 business days to get approved. Then you'll be contacted and given directions on how to proceed."
    },
    {
      question: "Are your products certified organic?",
      answer: "Listings and test information vary by product. Check the individual product page and its available documents, or ask us for the current listing and test information for the product you plan to use."
    },
    {
      question: "Can I get custom blends for my specific growing needs?",
      answer: "Yes, we do offer custom services. This is opt-in and requires a little planning. Depending on the complexity, it could take some time. Please contact us to discuss your specific needs and place an order."
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept credit cards, ACH, business checks, and cash. For our established partners, we offer net 30 and net 60 payment terms depending on quantity and order volume."
    },
    {
      question: "Do you offer seasonal discounts or promotions?",
      answer: "Yes, we offer seasonal promotions and volume-based discounts for our wholesale partners. These promotions are communicated through our newsletter and directly to our wholesale customers. Sign up for our newsletter to stay informed about upcoming special offers."
    },
    {
      question: "How should I store your products?",
      answer: "For optimal quality, our products should be stored in a cool, dry place away from direct sunlight. Bagged products should be kept off the ground and unopened until ready for use. Once opened, reseal the bag tightly or transfer to a sealed container to prevent moisture absorption."
    },
    {
      question: "What is your return policy?",
      answer: <>If your order arrives damaged or you have a product concern, call <a href={CUSTOMER_SUPPORT_PHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`} className="font-semibold text-primary underline">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</a> with your order number. Our team can review the issue and explain the available options before you return any material.</>
    },
    {
      question: "Do you ship internationally?",
      answer: "At this moment, we only ship within the United States. We are currently working on expanding our shipping capabilities. We reach nationwide through our partners at Amazon. Wholesale is only based on region or location. Contact our support team for more information."
    }
  ];

  return (
    <section id="faq" className="py-16 bg-white">
      <SEO
        title="Soil Shopping, Pickup & Delivery FAQs"
        description="Answers about buying soil by the bag, Phoenix pickup, Arizona delivery, product information and wholesale orders."
        canonical="https://www.organicsoilwholesale.com/faq"
      />
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-heading font-bold text-primary mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-neutral-800 max-w-3xl mx-auto">
            From a few bags for your garden to a bulk order: get help with shopping, pickup and delivery.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border border-neutral-200 rounded-lg px-6">
                <AccordionTrigger className="text-lg font-heading font-semibold">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-neutral-700 pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="text-center mt-12 space-y-4">
            <p className="text-neutral-800">
              Didn't find an answer to your question?
            </p>
            <Button asChild className="min-h-11 bg-primary hover:bg-primary-light text-white">
              <Link href="/contact">Contact Our Support Team</Link>
            </Button>
            <p className="text-sm text-neutral-700">
              Fastest: call{" "}
              <a href={CUSTOMER_SUPPORT_PHONE_TEL} className="font-semibold text-primary hover:underline">
                {CUSTOMER_SUPPORT_PHONE_DISPLAY}
              </a>
            </p>
          </div>
        </div>

        {/* Additional Resources Section */}
        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-heading font-bold text-primary mb-4">
              Additional Resources
            </h2>
            <p className="text-neutral-800 max-w-3xl mx-auto">
              Explore these resources to learn more about our products and how to get the best results.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-neutral-50 p-6 rounded-lg">
              <h3 className="font-heading font-semibold text-lg mb-3">Growing Tips</h3>
              <p className="text-neutral-700 mb-4">
                Expert advice on maximizing your growing potential with our organic soil products.
              </p>
              <a
                href="https://weareufe.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Visit Our Education Platform →
              </a>
            </div>

            <div className="bg-neutral-50 p-6 rounded-lg">
              <h3 className="font-heading font-semibold text-lg mb-3">Wholesale Information</h3>
              <p className="text-neutral-700 mb-4">
                Learn more about our wholesale program, benefits, and how to qualify.
              </p>
              <Link href="/wholesale" className="inline-flex min-h-11 items-center text-primary hover:underline font-medium">Wholesale Program →</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
