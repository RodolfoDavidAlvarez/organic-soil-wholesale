import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { MapPin, Phone, Mail, Clock, Leaf } from "lucide-react";
import { CUSTOMER_SUPPORT_PHONE_DIAL, CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { isCallTrackingExcludedPath } from "@/lib/callTracking";

const Footer = () => {
  const [location] = useLocation();
  const lockOfficialPhone = isCallTrackingExcludedPath(location);

  return (
    <footer className="relative z-10 mt-auto border-t border-white/10 bg-[#101f16] text-white">
      {!["/keep-growing", "/newsletter"].includes(location) && <div className="border-b border-white/10 bg-[#193d2d]">
        <div className="container mx-auto flex flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-heading text-2xl font-bold">Keep Growing With Us</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/80">Future giveaways, garden tips, new products, and local events. Be part of what’s growing.</p></div>
          <Link href="/keep-growing?source=website-footer" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#e8d3a8] px-6 py-3 font-bold text-[#133d2a] hover:bg-[#f3e0b5]">Count me in</Link>
        </div>
      </div>}
      <div className="py-14">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Company Info */}
            <div className="md:col-span-5">
              <div className="mb-5 flex flex-col gap-5">
                <img
                  src="/email-assets/ssw-logo-white.png"
                  alt="Soil Seed and Water"
                  width="423"
                  height="101"
                  className="h-auto w-56 max-w-full"
                  loading="lazy"
                />
                <a
                  href="https://weareufe.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center rounded-xl border border-white/15 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <img
                    src="/images/performance/ufe-logo-400.webp"
                    alt="Urban Farming Education"
                    width="400"
                    height="159"
                    className="h-10 w-auto"
                    loading="lazy"
                  />
                </a>
              </div>
              <p className="mb-4 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
                Arizona&apos;s premier producer of organic compost and soil amendments. Locally produced for landscapers, commercial growers, farms, and government projects.
              </p>
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                <Leaf className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#9ecb74]" />
                <span>Supporting sustainable agriculture and Arizona&apos;s circular economy through organic waste diversion.</span>
              </div>
              <p className="text-sm font-semibold text-[#9ecb74]">The trusted go-to resource for growers.</p>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-2">
              <h3 className="font-semibold text-lg mb-4 text-white">Quick Links</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/products">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Products
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/about">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      About Us
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/contact">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Contact
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/offers">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Deals
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/order">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Place Order
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/credit-application">
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Apply for Net Terms
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/careers">
                    <div className="flex min-h-11 items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Careers
                    </div>
                  </Link>
                </li>
              </ul>

              <h3 className="font-semibold text-lg mb-4 mt-8 text-white">Who We Serve</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/landscapers" onClick={() => trackEvent("Segment Link Clicked", { segment: "landscapers", source: "footer" })}>
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Landscapers
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/nurseries" onClick={() => trackEvent("Segment Link Clicked", { segment: "nurseries", source: "footer" })}>
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Nurseries
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/distributors" onClick={() => trackEvent("Segment Link Clicked", { segment: "distributors", source: "footer" })}>
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Distributors & Retail
                    </div>
                  </Link>
                </li>
                <li>
                  <Link href="/pickup" onClick={() => trackEvent("Segment Link Clicked", { segment: "pickup", source: "footer" })}>
                    <div className="flex items-center gap-1 text-white/70 transition-colors duration-200 hover:text-white">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Yard Pickup
                    </div>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact Info */}
            <div className="md:col-span-4">
              <h3 className="font-semibold text-lg mb-4 text-white">Contact Information</h3>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <div className="mr-3 mt-0.5 rounded-full bg-white/10 p-1.5">
                    <MapPin className="h-4 w-4 text-[#9ecb74]" />
                  </div>
                  <span className="text-white/70">
                    1634 N 19th Ave
                    <br />
                    Phoenix, AZ 85009
                  </span>
                </li>
                <li className="flex items-center">
                  <div className="mr-3 rounded-full bg-white/10 p-1.5">
                    <Phone className="h-4 w-4 text-[#9ecb74]" />
                  </div>
                  <a
                    href={CUSTOMER_SUPPORT_PHONE_TEL}
                    data-official-support-phone="true"
                    data-phone-number={CUSTOMER_SUPPORT_PHONE_DIAL}
                    {...(lockOfficialPhone
                      ? {
                          "data-callrail-ignore": "true",
                          "data-dynamic-number-ignore": "true",
                          "data-call-tracking-ignore": "true",
                          className:
                            "no-call-tracking font-medium text-white/70 transition-colors duration-200 hover:text-white",
                        }
                      : {
                          className:
                            "font-medium text-white/70 transition-colors duration-200 hover:text-white",
                        })}
                  >
                    <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
                  </a>
                </li>
                <li className="flex items-center">
                  <div className="mr-3 rounded-full bg-white/10 p-1.5">
                    <Mail className="h-4 w-4 text-[#9ecb74]" />
                  </div>
                  <span className="text-white/70">info@soilseedandwater.com</span>
                </li>
                <li className="flex items-start">
                  <div className="mr-3 mt-0.5 rounded-full bg-white/10 p-1.5">
                    <Clock className="h-4 w-4 text-[#9ecb74]" />
                  </div>
                  <span className="text-white/70">
                    By appointment only
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-[#0b160f] py-6 text-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="mb-4 text-sm text-white/60 md:mb-0">
              &copy; {new Date().getFullYear()} Soil Seed and Water LLC. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <Link href="/privacy" className="text-sm text-white/60 transition-colors duration-200 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-sm text-white/60 transition-colors duration-200 hover:text-white">
                Terms of Service
              </Link>
              <a
                href="https://soilseedandwater.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
              >
                Retail Store
              </a>
              <Link href="/store-locator" className="text-sm text-white/60 transition-colors duration-200 hover:text-white">
                Store Locator
              </Link>
              <Link href="/admin" className="text-sm text-white/60 transition-colors duration-200 hover:text-white">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
