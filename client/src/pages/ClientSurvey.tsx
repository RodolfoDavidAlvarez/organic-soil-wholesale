import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Check, ChevronLeft, Loader2, MapPin, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_SUPPORT_PHONE_DIAL,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
  PHOENIX_YARD_ADDRESS,
} from "@/config/contact";
import { usePhoneNumberLock } from "@/hooks/usePhoneNumberLock";
import { trackEvent } from "@/lib/analytics";
import { readSurveyPrefill } from "@shared/surveySources.js";

const FIELD_CLASS = "h-14 min-h-14 w-full rounded-2xl border-[#e4d8c0] bg-white px-4 text-base text-[#264027]";
const TEXTAREA_CLASS = "min-h-[140px] w-full rounded-2xl border-[#e4d8c0] bg-white px-4 py-3 text-base leading-6 text-[#264027]";

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

const STEPS = ["you", "visit", "finding", "return", "worked", "improve", "note"] as const;
type StepId = (typeof STEPS)[number];

const SCORE_OPTIONS = {
  visit: [
    { value: 1, label: "Rough" },
    { value: 2, label: "Okay" },
    { value: 3, label: "Good" },
    { value: 4, label: "Great" },
    { value: 5, label: "Excellent" },
  ],
  finding: [
    { value: 1, label: "Hard" },
    { value: 2, label: "Tricky" },
    { value: 3, label: "Okay" },
    { value: 4, label: "Easy" },
    { value: 5, label: "Simple" },
  ],
  return: [
    { value: 1, label: "No" },
    { value: 2, label: "Unlikely" },
    { value: 3, label: "Maybe" },
    { value: 4, label: "Likely" },
    { value: 5, label: "Yes" },
  ],
} as const;

function surveySource() {
  if (typeof window === "undefined") return "osw-survey";
  const tag = new URLSearchParams(window.location.search).get("source");
  return tag ? `osw-survey:${tag.slice(0, 80)}` : "osw-survey";
}

function readYardPrefill() {
  if (typeof window === "undefined") return { firstName: "", email: "" };
  return readSurveyPrefill(window.location.search);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ClientSurvey() {
  usePhoneNumberLock({ selector: "[data-phone-number]" });
  const [identityPrefill] = useState(() => readYardPrefill());
  const [firstName, setFirstName] = useState(() => identityPrefill.firstName);
  const [email, setEmail] = useState(() => identityPrefill.email);
  const [experience, setExperience] = useState<number | null>(null);
  const [findingUs, setFindingUs] = useState<number | null>(null);
  const [comeBack, setComeBack] = useState<number | null>(null);
  const [workedWell, setWorkedWell] = useState<string[]>([]);
  const [improveMost, setImproveMost] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [step, setStep] = useState<StepId>("you");
  const advanceTimer = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const hasPrefill = Boolean(identityPrefill.firstName || identityPrefill.email);
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    const prefill = readYardPrefill();
    if (prefill.firstName) setFirstName((current) => current || prefill.firstName);
    if (prefill.email) setEmail((current) => current || prefill.email);
  }, []);

  function go(next: StepId) {
    setError("");
    setStep(next);
  }

  function back() {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    if (stepIndex > 0) go(STEPS[stepIndex - 1]);
  }

  function toggleWorkedWell(option: string) {
    setWorkedWell((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  function continueFromYou() {
    if (!firstName.trim() || !validEmail(email)) {
      setError("Please enter your first name and email.");
      return;
    }
    go("visit");
  }

  function chooseScore(kind: "visit" | "finding" | "return", value: number) {
    const next = { visit: "finding", finding: "return", return: "worked" } as const;
    if (kind === "visit") setExperience(value);
    if (kind === "finding") setFindingUs(value);
    if (kind === "return") setComeBack(value);
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => go(next[kind]), 180);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "you") {
      continueFromYou();
      return;
    }
    if (step !== "note") return;
    if (experience == null || findingUs == null || comeBack == null) {
      setError("Please answer each score.");
      go(experience == null ? "visit" : findingUs == null ? "finding" : "return");
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
          scoreScale: 5,
          scores: { experience, findingUs, comeBack, scale: 5 },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We could not save your answers.");
      trackEvent("Client Survey Submitted", { source: surveySource() });
      setSuccess(true);
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : "";
      setError(message.startsWith("Please") || message.startsWith("We could") ? message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#e7dcc4] text-[#264027]">
      <Helmet>
        <title>How did we do? | Organic Soil Wholesale</title>
        <meta
          name="description"
          content="Honest feedback on your Phoenix yard visit or order with Organic Soil Wholesale."
        />
        <link rel="canonical" href="https://www.organicsoilwholesale.com/survey" />
      </Helmet>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5 sm:px-5 sm:py-8">
        <img
          src="/email-assets/ssw-logo-letter.png"
          alt="Soil Seed and Water"
          width={1758}
          height={419}
          className="h-11 w-auto shrink-0 self-start object-contain"
        />

        <section className="mt-5 rounded-[28px] border border-[#d9cdb4] bg-[#fffdf7] px-5 py-6 shadow-[0_18px_40px_rgba(38,64,39,0.08)] sm:px-7 sm:py-8">
          {success ? (
            <div className="survey-step flex flex-1 flex-col justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#264027] text-white">
                <Check className="h-6 w-6" />
              </div>
              <h1 className="mt-6 font-heading text-[2rem] font-bold leading-none">Thank you.</h1>
              <p className="mt-5 text-lg font-semibold leading-7">This one is on us.</p>
              <p className="mt-2 text-base leading-7 text-[#3d4a38]">
                A free 50 pound dairy compost for your next visit. Tell the yard your name.
              </p>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#b38a58]">
                90 days to redeem
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mb-6 flex items-center gap-3">
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex h-10 items-center gap-1 rounded-full px-1 text-sm font-semibold text-[#5c6658]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#b38a58]">Soil Seed and Water</span>
                )}
                <span className="ml-auto text-xs font-semibold tabular-nums text-[#8b8170]">
                  {stepIndex + 1} / {STEPS.length}
                </span>
              </div>
              <div className="mb-7 flex gap-1.5" aria-hidden="true">
                {STEPS.map((item, index) => (
                  <span
                    key={item}
                    className={`h-1 flex-1 rounded-full ${index <= stepIndex ? "bg-[#264027]" : "bg-[#eadfcd]"}`}
                  />
                ))}
              </div>

              <div key={step} className="survey-step">
                {step === "you" ? (
                  <div>
                    <h1 className="font-heading text-[2rem] font-bold leading-[1.05]">How did we do?</h1>
                    <p className="mt-3 text-base leading-7 text-[#3d4a38]">A fast survey for honest feedback.</p>
                    <div className="mt-7 grid gap-4">
                      {hasPrefill ? <p className="text-sm leading-6 text-[#6d6558]">This is you? Change it if not.</p> : null}
                      <div>
                        <label htmlFor="survey-first-name" className="mb-2 block text-sm font-semibold">
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
                        <label htmlFor="survey-email" className="mb-2 block text-sm font-semibold">
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
                    <StepError error={error} />
                    <div className="pt-7">
                      <PrimaryButton type="button" onClick={continueFromYou}>
                        Start
                      </PrimaryButton>
                    </div>
                  </div>
                ) : null}

                {step === "visit" ? (
                  <ScoreStep
                    title="How was your visit?"
                    options={SCORE_OPTIONS.visit}
                    value={experience}
                    onChange={(value) => chooseScore("visit", value)}
                  />
                ) : null}
                {step === "finding" ? (
                  <ScoreStep
                    title="How easy was it to find us?"
                    options={SCORE_OPTIONS.finding}
                    value={findingUs}
                    onChange={(value) => chooseScore("finding", value)}
                  />
                ) : null}
                {step === "return" ? (
                  <ScoreStep
                    title="Would you come back?"
                    options={SCORE_OPTIONS.return}
                    value={comeBack}
                    onChange={(value) => chooseScore("return", value)}
                  />
                ) : null}

                {step === "worked" ? (
                  <div>
                    <h1 className="font-heading text-[2rem] font-bold leading-[1.05]">What worked?</h1>
                    <p className="mt-3 text-base leading-7 text-[#3d4a38]">Tap any that fit.</p>
                    <div className="mt-6">
                      <ChoiceList
                        options={WORKED_WELL_OPTIONS}
                        selected={workedWell}
                        onToggle={toggleWorkedWell}
                      />
                    </div>
                    <div className="grid gap-2 pt-6">
                      <PrimaryButton type="button" onClick={() => go("improve")}>
                        Continue
                      </PrimaryButton>
                      <QuietButton onClick={() => go("improve")}>Skip</QuietButton>
                    </div>
                  </div>
                ) : null}

                {step === "improve" ? (
                  <div>
                    <h1 className="font-heading text-[2rem] font-bold leading-[1.05]">What should we improve most?</h1>
                    <p className="mt-3 text-base leading-7 text-[#3d4a38]">Tap one.</p>
                    <div className="mt-6">
                      <ChoiceList
                        options={IMPROVE_OPTIONS}
                        selected={improveMost ? [improveMost] : []}
                        onToggle={(option) => setImproveMost((current) => (current === option ? "" : option))}
                      />
                    </div>
                    <div className="grid gap-2 pt-6">
                      <PrimaryButton type="button" onClick={() => go("note")}>
                        Continue
                      </PrimaryButton>
                      <QuietButton onClick={() => go("note")}>Skip</QuietButton>
                    </div>
                  </div>
                ) : null}

                {step === "note" ? (
                  <div>
                    <h1 className="font-heading text-[2rem] font-bold leading-[1.05]">Anything else you want us to hear?</h1>
                    <div className="mt-6">
                      <label htmlFor="survey-notes" className="sr-only">
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
                    <StepError error={error} />
                    <div className="grid gap-3 pt-6">
                      <PrimaryButton type="submit" disabled={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Sending
                          </>
                        ) : (
                          "Send my answers"
                        )}
                      </PrimaryButton>
                      <p className="text-center text-xs leading-5 text-[#8b8170]">
                        Submitting this form does not sign you up for emails.
                      </p>
                    </div>
                  </div>
                ) : null}
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
            </form>
          )}
        </section>

        <footer className="px-1 py-6 text-sm leading-6 text-[#4e5849]">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b38a58]" />
            <span>
              Organic Soil Wholesale
              <br />
              {PHOENIX_YARD_ADDRESS}
            </span>
          </p>
          <p className="mt-2">
            <a
              href={CUSTOMER_SUPPORT_PHONE_TEL}
              data-phone-number={CUSTOMER_SUPPORT_PHONE_DIAL}
              data-official-support-phone="true"
              data-callrail-ignore="true" data-calltrk-noswap="true"
              data-dynamic-number-ignore="true"
              data-call-tracking-ignore="true"
              aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
              className="no-call-tracking inline-flex min-h-11 items-center gap-2 font-bold text-[#264027]"
            >
              <Phone className="h-4 w-4" />
              <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

function ScoreStep({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly { value: number; label: string }[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <h1 className="font-heading text-[2rem] font-bold leading-[1.05]">{title}</h1>
      <div className="mt-7 grid gap-2.5" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex min-h-14 items-center gap-4 rounded-2xl border px-4 text-left text-base font-semibold transition-colors ${
                selected
                  ? "border-[#264027] bg-[#264027] text-white"
                  : "border-[#e4d8c0] bg-white text-[#264027]"
              }`}
            >
              <span className={`w-5 text-sm tabular-nums ${selected ? "text-[#e7d3ae]" : "text-[#b38a58]"}`}>
                {option.value}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceList({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(option)}
            className={`flex min-h-14 items-center rounded-2xl border px-4 text-left text-base font-semibold leading-5 ${
              isOn ? "border-[#264027] bg-[#264027] text-white" : "border-[#e4d8c0] bg-white text-[#264027]"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function PrimaryButton({
  children,
  type,
  disabled,
  onClick,
}: {
  children: ReactNode;
  type: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-14 min-h-14 w-full items-center justify-center rounded-2xl bg-[#264027] text-base font-bold text-white disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function QuietButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 text-sm font-semibold text-[#6d6558]">
      {children}
    </button>
  );
}

function StepError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  );
}
