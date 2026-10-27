import { useState, type FormEvent } from "react";
import SEO from "@/components/layout/SEO";
import {
  BellRing,
  Check,
  CheckCircle2,
  Droplets,
  Leaf,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Sprout,
} from "lucide-react";
import {
  CUSTOMER_SUPPORT_PHONE_DIAL,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_DIRECTIONS_URL,
} from "@/config/contact";
import { usePhoneNumberLock } from "@/hooks/usePhoneNumberLock";
import { trackEvent } from "@/lib/analytics";

const TOPICS = [
  { value: "soil-reset", sourceLabel: "soil", label: "Resetting and rebuilding soil" },
  { value: "compost-worm-castings", sourceLabel: "compost", label: "Compost and worm castings" },
  { value: "arizona-planting", sourceLabel: "planting", label: "What to plant in Arizona" },
  { value: "watering", sourceLabel: "water", label: "Watering and moisture checks" },
  { value: "containers", sourceLabel: "container", label: "Containers and small spaces" },
  { value: "seed-starting", sourceLabel: "seeds", label: "Seeds and transplanting" },
  { value: "pests", sourceLabel: "pests", label: "Natural pest management" },
  { value: "fruit-trees", sourceLabel: "trees", label: "Fruit trees and perennial gardens" },
] as const;

const CUSTOMER_TYPES = [
  ["home-gardener", "Home gardener"],
  ["farmer", "Farmer / grower"],
  ["landscaper", "Landscaper"],
  ["nursery", "Nursery / greenhouse"],
  ["contractor", "Contractor"],
  ["municipal-commercial", "Municipal / commercial"],
  ["other", "Other"],
] as const;

type FormState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; firstName: string; topics: string[] }
  | { status: "error"; message: string };

function sourceWithTopics(topics: string[]) {
  const querySource = new URLSearchParams(window.location.search).get("source") || "classes-page";
  const safeSource = querySource.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 18);
  const topicLabels = TOPICS
    .filter((topic) => topics.includes(topic.value))
    .map((topic) => topic.sourceLabel)
    .join(".");
  return `garden-class-alerts-${safeSource}-topics-${topicLabels}`;
}

export default function Classes() {
  usePhoneNumberLock({ selector: "[data-phone-number]" });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [customerCategory, setCustomerCategory] = useState("home-gardener");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const selectedLabels = TOPICS
    .filter((topic) => selectedTopics.includes(topic.value))
    .map((topic) => topic.label);

  function toggleTopic(topic: string) {
    setSelectedTopics((current) => (
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]
    ));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedTopics.length) {
      setState({ status: "error", message: "Choose at least one class topic." });
      return;
    }

    setState({ status: "loading" });
    try {
      const source = sourceWithTopics(selectedTopics);
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          customerCategory,
          consent,
          website,
          source,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "We could not save your class alerts.");

      trackEvent("Garden Class Alerts Subscribed", {
        source,
        topics: selectedTopics.join(","),
      });
      setState({
        status: "success",
        firstName: name.trim().split(/\s+/)[0] || "there",
        topics: selectedLabels,
      });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  const isLoading = state.status === "loading";

  return (
    <>
      <SEO
        title="Garden Classes in Phoenix | Organic Soil Wholesale"
        description="Get alerts for upcoming hands-on Arizona garden classes at the Soil Seed & Water Phoenix yard and help choose future topics."
        keywords="garden classes phoenix, Arizona gardening class, soil workshop, compost class, garden workshop"
        canonical="https://organicsoilwholesale.com/classes"
      />

      <main className="min-h-screen bg-[#f6f4ec] text-[#263527]">
        <section className="overflow-hidden bg-[#264027] px-5 py-12 text-white sm:py-16">
          <div className="mx-auto max-w-5xl text-center">
            <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7b77d]/50 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#f5d99d]">
              <CheckCircle2 className="h-4 w-4" /> First class completed · More coming
            </div>
            <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Garden Classes at the Phoenix Yard
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
              Practical, welcoming classes for Arizona gardeners. Join the alert list and help choose what we teach next.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:py-16">
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#d8e0d2] bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#8a6a42]">Growing Knowledge</p>
              <h2 className="mt-3 font-heading text-3xl font-black text-[#264027]">Our first Garden Reset was only the beginning.</h2>
              <p className="mt-4 leading-7 text-neutral-700">
                Local gardeners gathered to learn how to rebuild soil after summer, check moisture, choose Arizona-adapted seeds, and prepare for the cool season. Future classes will stay hands-on and community-driven.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                { icon: Sprout, title: "Arizona-specific", text: "Seasonal guidance built for desert growing." },
                { icon: Leaf, title: "Hands-on", text: "See the method and practice it at the yard." },
                { icon: Droplets, title: "Community-led", text: "Your topic choices help shape the next classes." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-[#d8e0d2] bg-white p-5 shadow-sm">
                  <Icon className="h-6 w-6 text-[#264027]" />
                  <h3 className="mt-4 font-bold text-[#264027]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{text}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-[#e9efe4] p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <BellRing className="mt-1 h-6 w-6 shrink-0 text-[#264027]" />
                <div>
                  <h2 className="font-heading text-2xl font-bold text-[#264027]">What alerts include</h2>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
                    {["New class dates and registration links", "The topic and what you will learn", "Time, location, and what to bring"].map((item) => (
                      <li key={item} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-[#264027]" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-3 px-1 text-sm text-neutral-600">
              <a href={PHOENIX_YARD_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
                <MapPin className="h-4 w-4" /> 1634 N 19th Ave, Phoenix
              </a>
              <a
                href={CUSTOMER_SUPPORT_PHONE_TEL}
                aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
                data-official-support-phone="true"
                data-phone-number={CUSTOMER_SUPPORT_PHONE_DIAL}
                data-callrail-ignore="true" data-calltrk-noswap="true"
                data-dynamic-number-ignore="true"
                data-call-tracking-ignore="true"
                className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4"
              >
                <Phone className="h-4 w-4" /> <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
              </a>
              <a href="mailto:info@soilseedandwater.com" className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
                <Mail className="h-4 w-4" /> Email us
              </a>
            </div>
          </div>

          <div id="class-alert-signup" className="rounded-3xl border border-[#d8e0d2] bg-white p-6 shadow-xl sm:p-8">
            {state.status === "success" ? (
              <div className="py-8 text-center" aria-live="polite">
                <CheckCircle2 className="mx-auto h-16 w-16 text-[#264027]" strokeWidth={1.5} />
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#8a6a42]">You’re on the class alert list</p>
                <h2 className="mt-3 font-heading text-3xl font-black text-[#264027]">Thanks, {state.firstName}.</h2>
                <p className="mx-auto mt-4 max-w-md leading-7 text-neutral-600">
                  We’ll email you when new Garden Class dates and topics are posted.
                </p>
                <div className="mx-auto mt-6 max-w-md rounded-2xl bg-[#eef3e9] p-5 text-left">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a42]">Your topic interests</p>
                  <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                    {state.topics.map((topic) => <li key={topic} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#264027]" />{topic}</li>)}
                  </ul>
                </div>
                <a href="/" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[#264027] px-5 py-3 font-bold text-[#264027]">Return to OSW</a>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#8a6a42]">Free class alerts</p>
                  <h2 className="mt-2 font-heading text-3xl font-black text-[#264027]">Tell us what you want to learn.</h2>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">Choose your topics, then we’ll alert you when a matching class is posted.</p>
                </div>

                <fieldset>
                  <legend className="text-sm font-bold text-neutral-800">Class topics <span className="font-normal text-neutral-500">(choose one or more)</span></legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {TOPICS.map((topic) => {
                      const selected = selectedTopics.includes(topic.value);
                      return (
                        <label key={topic.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${selected ? "border-[#264027] bg-[#eef3e9] text-[#264027]" : "border-neutral-200 text-neutral-700 hover:border-[#9eab97]"}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.value)} className="h-5 w-5 shrink-0 accent-[#264027]" />
                          {topic.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="class-name" className="mb-2 block text-sm font-bold text-neutral-800">Full name</label><input id="class-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={isLoading} required maxLength={120} className="min-h-12 w-full rounded-xl border border-neutral-200 px-4 text-base focus:border-[#264027] focus:outline-none" /></div>
                  <div><label htmlFor="class-email" className="mb-2 block text-sm font-bold text-neutral-800">Email address</label><input id="class-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoading} required maxLength={254} className="min-h-12 w-full rounded-xl border border-neutral-200 px-4 text-base focus:border-[#264027] focus:outline-none" /></div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="class-phone" className="mb-2 block text-sm font-bold text-neutral-800">Phone number</label><input id="class-phone" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={isLoading} required maxLength={30} placeholder="(623) 555-0123" className="min-h-12 w-full rounded-xl border border-neutral-200 px-4 text-base focus:border-[#264027] focus:outline-none" /></div>
                  <div><label htmlFor="class-customer-type" className="mb-2 block text-sm font-bold text-neutral-800">I’m a…</label><select id="class-customer-type" value={customerCategory} onChange={(event) => setCustomerCategory(event.target.value)} disabled={isLoading} required className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-base focus:border-[#264027] focus:outline-none">{CUSTOMER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                </div>

                <div className="hidden" aria-hidden="true"><label htmlFor="class-website">Website</label><input id="class-website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f6f4ec] p-4 text-sm leading-6 text-neutral-700">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required className="mt-0.5 h-5 w-5 shrink-0 accent-[#264027]" />
                  <span>Email me when new Garden Class dates and topics are posted. I can unsubscribe at any time.</span>
                </label>

                {state.status === "error" ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.message}</p> : null}

                <button type="submit" disabled={isLoading} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#264027] px-5 py-4 text-base font-extrabold text-white transition hover:bg-[#1d3422] disabled:opacity-50">
                  {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Saving your alerts…</> : <><BellRing className="h-5 w-5" /> Alert Me About Garden Classes</>}
                </button>
                <p className="text-center text-xs leading-5 text-neutral-500">No charge. No class is reserved until a date is announced and you complete that class registration.</p>
              </form>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
