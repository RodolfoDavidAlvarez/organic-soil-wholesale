import { FormEvent, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Loader2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreSlider } from "@/components/survey/ScoreSlider";
import {
  CUSTOMER_SUPPORT_PHONE_DIAL,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_ADDRESS,
} from "@/config/contact";
import { usePhoneNumberLock } from "@/hooks/usePhoneNumberLock";
import { trackEvent } from "@/lib/analytics";
import { readSurveyPrefill } from "@shared/surveySources.js";

const FIELD_CLASS = "h-12 min-h-12 w-full rounded-xl border-[#d7dfd0] bg-white text-base";
const TEXTAREA_CLASS = "min-h-[120px] w-full rounded-xl border-[#d7dfd0] bg-white text-base leading-6";

const WORKED_WELL_OPTIONS = [
  "Finding the yard / entrance",
  "Staff",
  "Loading / pickup",
  "Product quality",
  "Paying online",
  "Hours",
  "Prices",
] as const;

const IMPROVE_OPTIONS = [
  "Finding the yard / entrance",
  "Signs / directions",
  "Wait time",
  "Loading",
  "Product selection",
  "Website / ordering",
  "Hours",
  "Nothing to change",
] as const;

type SurveyCoupon = {
  code: string;
  label: string;
  offer: string;
  restrictions: string;
  firstName: string;
  email: string;
  issuedAt: string;
  expiresAt: string;
  qrUrl: string;
  reused?: boolean;
};

function phoenixDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function surveySource() {
  if (typeof window === "undefined") return "osw-survey";
  const tag = new URLSearchParams(window.location.search).get("source");
  return tag ? `osw-survey:${tag.slice(0, 80)}` : "osw-survey";
}

function readYardPrefill() {
  if (typeof window === "undefined") return { firstName: "", email: "" };
  return readSurveyPrefill(window.location.search);
}

export default function ClientSurvey() {
  usePhoneNumberLock({ selector: "[data-phone-number]" });
  const [identityPrefill] = useState(() => readYardPrefill());
  const [firstName, setFirstName] = useState(() => identityPrefill.firstName);
  const [email, setEmail] = useState(() => identityPrefill.email);
  const [experience, setExperience] = useState(5);
  const [findingUs, setFindingUs] = useState(5);
  const [comeBack, setComeBack] = useState(5);
  const [workedWell, setWorkedWell] = useState<string[]>([]);
  const [improveMost, setImproveMost] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [coupon, setCoupon] = useState<SurveyCoupon | null>(null);
  const [error, setError] = useState("");
  const hasPrefill = Boolean(identityPrefill.firstName || identityPrefill.email);

  useEffect(() => {
    const prefill = readYardPrefill();
    if (prefill.firstName) setFirstName((current) => current || prefill.firstName);
    if (prefill.email) setEmail((current) => current || prefill.email);
  }, []);

  function toggleWorkedWell(option: string) {
    setWorkedWell((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (experience == null || findingUs == null || comeBack == null) {
      setError("Please slide each score.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/survey/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          notes,
          experienceScore: experience,
          findingUs,
          comeBack,
          workedWell,
          improveMost,
          website,
          source: surveySource(),
          scores: { experience, findingUs, comeBack },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not save your answers.");
      trackEvent("Client Survey Submitted", { source: surveySource() });
      setCoupon(body.coupon || null);
      setSuccess(true);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fffdf7] text-[#264027]">
      <Helmet>
        <title>How did we do? | Organic Soil Wholesale</title>
        <meta
          name="description"
          content="Honest feedback on your Phoenix yard visit or order with Organic Soil Wholesale."
        />
        <link rel="canonical" href="https://www.organicsoilwholesale.com/survey" />
      </Helmet>

      <div className="bg-[#fffdf7] px-5 py-4">
        <div className="mx-auto max-w-md">
          <img
            src="/email-assets/ssw-logo-letter.png"
            alt="Soil Seed & Water / Organic Soil Wholesale"
            width={1758}
            height={419}
            className="h-9 w-auto max-w-[220px]"
          />
        </div>
      </div>

      <section className="relative bg-[#264027] px-5 py-11 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d7b77d]">Soil Seed &amp; Water</p>
          <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">How did the yard feel?</h1>
          <p className="mt-4 text-base leading-7 text-white/90">
            Honest feedback. Three quick taps.
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#b38a58] to-[#d7b77d]" />
      </section>

      <section className="mx-auto max-w-md px-5 py-8">
        {success ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#e6dcc8] bg-white p-6 shadow-[0_8px_24px_rgba(38,64,39,0.06)]">
              <CheckCircle2 className="mb-4 h-12 w-12 text-[#264027]" />
              <h2 className="font-heading text-2xl font-bold">Thank you. We read these.</h2>
              <p className="mt-3 text-base leading-7 text-neutral-700">
                Your note lands with the yard team, not a marketing list. If we need a follow-up, we will use the email you left.
              </p>
              {coupon ? (
                <p className="mt-3 text-base font-semibold leading-7 text-[#264027]">
                  Show this at the yard.
                </p>
              ) : null}
            </div>

            {coupon ? <SurveyCouponCard coupon={coupon} /> : null}

            <p className="text-sm leading-6 text-neutral-600">
              Current Phoenix pickup deals are on the Deals page.
            </p>
            <a
              href="/offers"
              className="inline-flex min-h-11 items-center text-base font-bold text-[#264027] underline"
            >
              See current deals
            </a>
            <p className="text-sm leading-6 text-neutral-700">
              Rodo Alvarez
              <br />
              Soil Seed and Water
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-7">
            <p className="text-base leading-7 text-neutral-700">
              {hasPrefill
                ? "Name and email first so we know who wrote this. Then slide what is true."
                : "Name and email first so we know who wrote this. Change them if they are not you. Then slide what is true."}
            </p>
            <p className="text-base font-semibold leading-7 text-[#264027]">
              Finish this and we'll give you 30% off one item at the yard.
            </p>

            <div className="grid gap-4 rounded-2xl border border-[#e6dcc8] bg-white p-5 shadow-[0_8px_24px_rgba(38,64,39,0.06)]">
              {hasPrefill ? (
                <p className="text-sm leading-6 text-neutral-500">This is you? Change it if not.</p>
              ) : null}
              <div>
                <label htmlFor="survey-first-name" className="mb-2 block text-sm font-semibold text-[#264027]">
                  First name
                </label>
                <Input
                  id="survey-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="survey-email" className="mb-2 block text-sm font-semibold text-[#264027]">
                  Email
                </label>
                <Input
                  id="survey-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={254}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <ScoreSlider
              id="survey-experience"
              legend="How was your visit or order?"
              lowLabel="rough"
              highLabel="great"
              value={experience}
              onChange={setExperience}
            />
            <ScoreSlider
              id="survey-finding-us"
              legend="How easy was it to find us / get here?"
              lowLabel="hard to find"
              highLabel="easy"
              value={findingUs}
              onChange={setFindingUs}
            />
            <ScoreSlider
              id="survey-come-back"
              legend="Would you come back?"
              lowLabel="no way"
              highLabel="absolutely"
              value={comeBack}
              onChange={setComeBack}
            />

            <ChipGroup
              legend="What worked?"
              hint="Tap any that fit"
              options={WORKED_WELL_OPTIONS}
              selected={workedWell}
              onToggle={toggleWorkedWell}
            />
            <ChipGroup
              legend="What should we improve most?"
              hint="Tap one"
              options={IMPROVE_OPTIONS}
              selected={improveMost ? [improveMost] : []}
              onToggle={(option) => setImproveMost((current) => (current === option ? "" : option))}
            />

            <div>
              <label htmlFor="survey-notes" className="mb-2 block text-sm font-semibold text-[#264027]">
                Anything else you want us to hear?
              </label>
              <Textarea
                id="survey-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                className={TEXTAREA_CLASS}
              />
            </div>

            <div className="hidden" aria-hidden="true">
              <label htmlFor="survey-website">Website</label>
              <Input
                id="survey-website"
                name="website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={submitting}
              className="h-14 min-h-14 w-full rounded-xl bg-[#264027] text-base font-bold text-white hover:bg-[#1d301e]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send my answers"
              )}
            </Button>
            <p className="text-center text-xs leading-5 text-neutral-500">
              Submitting this form does not sign you up for emails.
            </p>
          </form>
        )}
      </section>

      <footer className="border-t border-[#e6dcc8] bg-[#f7f3e8] px-5 py-8">
        <div className="mx-auto max-w-md space-y-3 text-sm leading-6 text-neutral-700">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b38a58]" />
            <span>
              Organic Soil Wholesale
              <br />
              {PHOENIX_YARD_ADDRESS}
            </span>
          </p>
          <p>
            <a
              href={CUSTOMER_SUPPORT_PHONE_TEL}
              data-phone-number={CUSTOMER_SUPPORT_PHONE_DIAL}
              data-official-support-phone="true"
              data-callrail-ignore="true" data-calltrk-noswap="true"
              data-dynamic-number-ignore="true"
              data-call-tracking-ignore="true"
              aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
              className="no-call-tracking inline-flex min-h-11 min-w-11 items-center gap-2 font-bold text-[#264027]"
            >
              <Phone className="h-4 w-4" />
              <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}

function SurveyCouponCard({ coupon }: { coupon: SurveyCoupon }) {
  const issued = phoenixDate(coupon.issuedAt);
  const expires = phoenixDate(coupon.expiresAt);
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-[#b38a58] bg-white text-[#264027] shadow-sm print:border print:shadow-none">
      <div className="bg-[#264027] px-5 py-5 text-center text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#b38a58]">
          Soil Seed &amp; Water
        </p>
        <p className="mt-1 text-sm font-semibold text-white/85">Organic Soil Wholesale</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[#b38a58]">
          {coupon.label}
        </p>
        <h3 className="mt-2 font-heading text-3xl font-bold leading-tight">30% off</h3>
        <p className="mt-2 text-base font-semibold leading-6">{coupon.offer}</p>
      </div>

      <div className="px-5 py-5 text-center">
        <img
          src={coupon.qrUrl}
          alt={`Yard coupon ${coupon.code}`}
          className="mx-auto w-full max-w-[220px] rounded-xl border border-[#d7dfd0] bg-white p-3"
        />
        <p className="mt-3 break-all font-mono text-lg font-bold tracking-wide">{coupon.code}</p>
        <dl className="mt-4 space-y-2 rounded-xl bg-[#f6f8f3] px-4 py-4 text-left text-sm leading-6">
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#b38a58]">Name</dt>
            <dd className="font-semibold">{coupon.firstName}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#b38a58]">Email</dt>
            <dd className="break-all font-semibold">{coupon.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#b38a58]">Date</dt>
            <dd className="font-semibold">{issued}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#b38a58]">Valid through</dt>
            <dd className="font-semibold">{expires}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm font-semibold leading-6">
          Phoenix yard pickup · {PHOENIX_YARD_ADDRESS}
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{coupon.restrictions}</p>
        {coupon.reused ? (
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            This is the same yard coupon from your first survey.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#264027] bg-white px-4 text-sm font-bold text-[#264027] print:hidden"
        >
          Print or screenshot this card
        </button>
      </div>
    </article>
  );
}

function ChipGroup({
  legend,
  hint,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  hint?: string;
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-semibold text-[#264027]">
        {legend}
        {hint ? <span className="ml-2 font-normal text-neutral-500">{hint}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isOn = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={isOn}
              className={`inline-flex min-h-12 items-center rounded-2xl border-2 px-4 py-2.5 text-base font-bold leading-5 ${
                isOn
                  ? "border-[#264027] bg-[#264027] text-white"
                  : "border-[#8aa089] bg-[#fffdf7] text-[#264027]"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
