import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import SEO from "@/components/layout/SEO";
import { SchoolFrame } from "@/components/school/SchoolFrame";
import { absoluteUrl } from "@/config/seo";
import {
  fetchSchoolStatus,
  loadSchoolUtms,
  recallSchoolLookup,
  rememberSchoolLookup,
  type SchoolStatusResult,
} from "@/lib/schoolVerificationClient";
import { validateStatusLookup, withUtm } from "@shared/schoolVerification.js";

function formatPhoenix(value: string | null) {
  if (!value) return "May 31, 2027";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "May 31, 2027";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function SchoolStatus() {
  const [location] = useLocation();
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ id?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SchoolStatusResult | null>(null);
  const [copied, setCopied] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUtm(loadSchoolUtms(window.location.search));
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("id") || "";
    const remembered = recallSchoolLookup();
    setId(queryId || remembered?.id || "");
    if (remembered && (!queryId || remembered.id === queryId)) setEmail(remembered.email);
  }, [location]);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setResult(null);
    const validation = validateStatusLookup({ id, email });
    setErrors(validation.errors);
    if (!validation.ok) {
      (validation.errors.id ? idRef : emailRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      const status = await fetchSchoolStatus(validation.id, validation.email);
      rememberSchoolLookup(validation.id, validation.email);
      setResult(status);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't check that verification.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!result?.discountCode) return;
    try {
      await navigator.clipboard.writeText(result.discountCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const normalized = String(result?.status || "").toLowerCase();

  return (
    <>
      <SEO
        title="School verification status"
        description="Check a school verification. Approved schools receive a one-time code for 30% off bagged products."
        canonical={absoluteUrl("/schools/status")}
      />
      <SchoolFrame utm={utm}>
        <h1 className="mt-3 font-heading text-4xl font-black leading-tight text-[#183a23]">
          Check your school verification
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[#3d4a41]">
          Use the reference from your confirmation and the same email. Approved schools get a one-time code for 30% off bagged products through May 31, 2027.
        </p>

        <form className="mt-6 space-y-4 rounded-2xl bg-white p-4 sm:p-5" onSubmit={onSubmit} noValidate>
          <div>
            <label htmlFor="school-status-id" className="text-sm font-bold text-[#183a23]">Reference</label>
            <input ref={idRef} id="school-status-id" value={id} onChange={(event) => setId(event.target.value)} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border border-[#183a23]/15 px-3 text-base" aria-invalid={Boolean(errors.id)} aria-describedby={errors.id ? "school-status-id-error" : undefined} />
            {errors.id && <p id="school-status-id-error" className="mt-1 text-sm text-red-700">{errors.id}</p>}
          </div>
          <div>
            <label htmlFor="school-status-email" className="text-sm font-bold text-[#183a23]">Email</label>
            <input ref={emailRef} id="school-status-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1 min-h-12 w-full rounded-xl border border-[#183a23]/15 px-3 text-base" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "school-status-email-error" : undefined} />
            {errors.email && <p id="school-status-email-error" className="mt-1 text-sm text-red-700">{errors.email}</p>}
          </div>
          {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-800 outline-none">{formError}</p>}
          <button type="submit" disabled={loading} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#183a23] px-5 text-base font-bold text-white disabled:opacity-60">
            {loading ? "Checking…" : "Check status"}
          </button>
        </form>

        {result && normalized === "pending" && (
          <section className="mt-4 rounded-2xl border border-[#b38a58]/40 bg-white p-5" aria-live="polite">
            <h2 className="font-heading text-2xl font-bold text-[#183a23]">Pending</h2>
            <p className="mt-2 text-base leading-relaxed">We have the ID and are reviewing it. This usually takes 1 business day.</p>
          </section>
        )}

        {result && (normalized === "approved" || normalized === "approve") && (
          <section className="mt-4 rounded-2xl border border-[#215330]/20 bg-white p-5" aria-live="polite">
            <h2 className="font-heading text-2xl font-bold text-[#183a23]">Approved</h2>
            {result.discountCode ? (
              <>
                <p className="mt-2 text-base">Your one-time code for 30% off bagged products:</p>
                <p className="mt-3 break-all rounded-xl bg-[#f6f4ee] px-4 py-3 font-mono text-xl font-bold text-[#183a23]">{result.discountCode}</p>
                <button type="button" onClick={copyCode} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[#183a23]/20 px-4 text-sm font-bold">
                  {copied ? "Copied" : "Copy code"}
                </button>
                <p className="mt-3 text-base leading-relaxed">
                  Use it at checkout for online pickup, or read it to us on the phone. It expires {formatPhoenix(result.discountExpiresAt)} and cannot be combined with other discounts, including the 20% pallet discount.
                </p>
              </>
            ) : (
              <p className="mt-2 text-base leading-relaxed">You are approved. If the code is not in your email yet, call us and we will look it up.</p>
            )}
          </section>
        )}

        {result && (normalized === "denied" || normalized === "rejected") && (
          <section className="mt-4 rounded-2xl border border-red-200 bg-white p-5" aria-live="polite">
            <h2 className="font-heading text-2xl font-bold text-[#183a23]">Not approved</h2>
            <p className="mt-2 text-base leading-relaxed">We could not verify this school ID. Call us if we should take another look.</p>
          </section>
        )}

        {result && !["pending", "approved", "approve", "denied", "rejected"].includes(normalized) && (
          <section className="mt-4 rounded-2xl bg-white p-5" aria-live="polite">
            <h2 className="font-heading text-2xl font-bold text-[#183a23]">Status: {result.status}</h2>
            <p className="mt-2 text-base">Call us if you need help with this verification.</p>
          </section>
        )}

        <p className="mt-4 text-sm">
          <Link href={withUtm("/schools", utm)} className="inline-flex min-h-11 items-center font-bold text-[#183a23] underline">Back to the school offer</Link>
        </p>
      </SchoolFrame>
    </>
  );
}
