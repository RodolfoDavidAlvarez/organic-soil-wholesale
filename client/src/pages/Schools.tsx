import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";
import SEO from "@/components/layout/SEO";
import { SchoolFrame } from "@/components/school/SchoolFrame";
import { absoluteUrl } from "@/config/seo";
import { loadSchoolUtms, rememberSchoolLookup, submitSchoolVerification } from "@/lib/schoolVerificationClient";
import {
  schoolIdContentType,
  schoolIdPreviewKind,
  validateSchoolSubmission,
  withUtm,
} from "@shared/schoolVerification.js";

const RULES = [
  "Bagged products only. Bulk sizes are not included.",
  "A school ID is required.",
  "The offer ends May 31, 2027.",
  "It cannot be combined with any other discount, including the 20% full-pallet discount.",
];

const STEPS = [
  "Submit your school ID.",
  "We verify it, usually within 1 business day.",
  "Get your code and order online for pickup, or call us.",
];

type FieldErrors = Record<string, string>;

export default function Schools() {
  const [location] = useLocation();
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [schoolName, setSchoolName] = useState("");
  const [schoolDistrict, setSchoolDistrict] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [pickupOrPhone, setPickupOrPhone] = useState<"online_pickup" | "phone" | "">("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string } | null>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const contentType = file ? schoolIdContentType(file) : null;
  const previewKind = schoolIdPreviewKind(contentType || "");

  useEffect(() => {
    setUtm(loadSchoolUtms(window.location.search));
  }, [location]);

  useEffect(() => {
    if (!file || (previewKind !== "image" && previewKind !== "heic")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file, previewKind]);

  useEffect(() => {
    if (confirmation) successRef.current?.focus();
  }, [confirmation]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const validation = validateSchoolSubmission({
      schoolName,
      schoolDistrict,
      contactName,
      contactEmail,
      contactPhone,
      orderReference,
      pickupOrPhone,
      consent,
      file,
    });
    setErrors(validation.errors);
    if (!validation.ok || !file || (pickupOrPhone !== "online_pickup" && pickupOrPhone !== "phone")) {
      errorRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitSchoolVerification(file, {
        schoolName,
        schoolDistrict,
        contactName,
        contactEmail,
        contactPhone,
        orderReference,
        pickupOrPhone,
      }, utm);
      rememberSchoolLookup(saved.id, contactEmail.trim());
      setConfirmation({ id: saved.id });
      setFile(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't save the verification. Please try again.");
      errorRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO
        title="30% off for schools"
        description="Schools get 30% off bagged soil, compost, and mulch through May 31, 2027. Submit a school ID, then use your one-time code for Phoenix yard pickup."
        canonical={absoluteUrl("/schools")}
      />
      <SchoolFrame utm={utm}>
        <h1 className="mt-3 font-heading text-4xl font-black leading-[1.05] text-[#183a23] sm:text-5xl">
          We are gardeners. 30% off for schools.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#3d4a41]">
          Soil Seed &amp; Water grows soil for Arizona gardens. Through May 31, 2027, verified schools save 30% on bagged products for pickup.
        </p>

        <section className="mt-6 rounded-2xl border border-[#183a23]/10 bg-white p-4 sm:p-5" aria-labelledby="school-rules">
          <h2 id="school-rules" className="font-heading text-xl font-bold text-[#183a23]">Offer rules</h2>
          <ul className="mt-3 space-y-2 text-base leading-relaxed text-[#3d4a41]">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#215330]" aria-hidden="true" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4" aria-labelledby="school-steps">
          <h2 id="school-steps" className="font-heading text-xl font-bold text-[#183a23]">How it works</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex min-h-11 items-start gap-3 rounded-2xl bg-white px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#183a23] text-sm font-bold text-white" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="pt-1 text-base leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {confirmation ? (
          <section className="mt-6 rounded-2xl border border-[#215330]/20 bg-white p-5" aria-labelledby="school-success">
            <h2 id="school-success" ref={successRef} tabIndex={-1} className="font-heading text-2xl font-bold text-[#183a23] outline-none">
              We received your school ID.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#3d4a41]">
              Your reference is <strong className="break-all text-[#183a23]">{confirmation.id}</strong>. We usually verify within 1 business day. When it is approved, your code arrives by email.
            </p>
            <p className="mt-3 text-base leading-relaxed text-[#3d4a41]">
              Then order bagged products online for pickup and enter the code at checkout, or call us and we will use it with you.
            </p>
            <Link
              href={withUtm(`/schools/status?id=${encodeURIComponent(confirmation.id)}`, utm)}
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-[#b38a58] px-5 text-base font-bold text-[#183a23]"
            >
              Check verification status
            </Link>
          </section>
        ) : (
          <form className="mt-6 space-y-4 rounded-2xl border border-[#183a23]/10 bg-white p-4 sm:p-5" onSubmit={onSubmit} noValidate>
            <h2 className="font-heading text-2xl font-bold text-[#183a23]">Submit a school ID</h2>
            <p className="text-sm leading-relaxed text-[#3d4a41]">
              The ID is used only to verify eligibility. It is not shown on the website.
            </p>

            {(formError || Object.keys(errors).length > 0) && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 outline-none">
                {formError || "Check the highlighted fields and try again."}
              </div>
            )}

            <Field label="School name" id={`${formId}-school`} error={errors.schoolName} required>
              <input id={`${formId}-school`} value={schoolName} onChange={(event) => setSchoolName(event.target.value)} autoComplete="organization" required className={inputClass} {...invalidProps(`${formId}-school`, errors.schoolName)} />
            </Field>
            <Field label="District" id={`${formId}-district`} error={errors.schoolDistrict} optional>
              <input id={`${formId}-district`} value={schoolDistrict} onChange={(event) => setSchoolDistrict(event.target.value)} className={inputClass} {...invalidProps(`${formId}-district`, errors.schoolDistrict)} />
            </Field>
            <Field label="Contact name" id={`${formId}-name`} error={errors.contactName} required>
              <input id={`${formId}-name`} value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" required className={inputClass} {...invalidProps(`${formId}-name`, errors.contactName)} />
            </Field>
            <Field label="Email" id={`${formId}-email`} error={errors.contactEmail} required>
              <input id={`${formId}-email`} type="email" inputMode="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} autoComplete="email" required className={inputClass} {...invalidProps(`${formId}-email`, errors.contactEmail)} />
            </Field>
            <Field label="Phone" id={`${formId}-phone`} error={errors.contactPhone} optional>
              <input id={`${formId}-phone`} type="tel" inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} autoComplete="tel" className={inputClass} {...invalidProps(`${formId}-phone`, errors.contactPhone)} />
            </Field>
            <Field label="Order reference" id={`${formId}-order`} error={errors.orderReference} optional>
              <input id={`${formId}-order`} value={orderReference} onChange={(event) => setOrderReference(event.target.value)} className={inputClass} {...invalidProps(`${formId}-order`, errors.orderReference)} />
            </Field>

            <fieldset aria-invalid={Boolean(errors.pickupOrPhone)} aria-describedby={errors.pickupOrPhone ? `${formId}-method-error` : undefined}>
              <legend className="text-sm font-bold text-[#183a23]">How will you order?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[#183a23]/15 px-3 text-base">
                  <input type="radio" name="pickup-or-phone" value="online_pickup" checked={pickupOrPhone === "online_pickup"} onChange={() => setPickupOrPhone("online_pickup")} className="h-5 w-5" />
                  Online pickup
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[#183a23]/15 px-3 text-base">
                  <input type="radio" name="pickup-or-phone" value="phone" checked={pickupOrPhone === "phone"} onChange={() => setPickupOrPhone("phone")} className="h-5 w-5" />
                  Phone
                </label>
              </div>
              {errors.pickupOrPhone && <p id={`${formId}-method-error`} className="mt-1 text-sm text-red-700">{errors.pickupOrPhone}</p>}
            </fieldset>

            <Field label="School ID" id={`${formId}-id`} error={errors.idFile} required>
              <input
                id={`${formId}-id`}
                type="file"
                accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf"
                className="block w-full text-base file:mr-3 file:inline-flex file:min-h-11 file:items-center file:rounded-full file:border-0 file:bg-[#183a23] file:px-4 file:text-sm file:font-bold file:text-white"
                {...invalidProps(`${formId}-id`, errors.idFile)}
                onChange={(event) => {
                  const next = event.target.files?.[0] || null;
                  setFile(next);
                  setPreviewFailed(false);
                }}
              />
              <p className="text-sm text-[#6b7468]">JPG, PNG, HEIC, or PDF. 10 MB maximum.</p>
              {file && previewUrl && !previewFailed && previewKind === "image" && (
                <img src={previewUrl} alt="Preview of the school ID you selected" className="max-h-48 rounded-xl border border-[#183a23]/10 object-contain" />
              )}
              {file && previewKind === "heic" && (
                <p className="rounded-xl bg-[#f6f4ee] px-3 py-2 text-sm">
                  {file.name} is attached. This phone may not show a HEIC preview, and the file still uploads.
                </p>
              )}
              {file && previewKind === "pdf" && (
                <p className="rounded-xl bg-[#f6f4ee] px-3 py-2 text-sm">{file.name} is attached.</p>
              )}
            </Field>

            <label className="flex min-h-12 items-start gap-3 rounded-xl bg-[#f6f4ee] px-3 py-3 text-base leading-relaxed">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5" required {...invalidProps(`${formId}-consent`, errors.consent)} />
              <span>I agree this school ID is used only to verify eligibility for the school rate.</span>
            </label>
            {errors.consent && <p id={`${formId}-consent-error`} className="text-sm text-red-700">{errors.consent}</p>}

            <button type="submit" disabled={submitting} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#183a23] px-5 text-base font-bold text-white disabled:opacity-60">
              {submitting ? "Sending school ID…" : "Submit school ID"}
            </button>
            <p className="text-center text-sm">
              <Link href={withUtm("/schools/status", utm)} className="inline-flex min-h-11 items-center font-bold text-[#183a23] underline">
                Already submitted? Check your status
              </Link>
            </p>
          </form>
        )}
      </SchoolFrame>
    </>
  );
}

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[#183a23]/15 px-3 text-base";

function invalidProps(id: string, error?: string) {
  return error
    ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
    : { "aria-invalid": false as const };
}

function Field({
  label,
  id,
  error,
  required,
  optional,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-bold text-[#183a23]">
        {label}
        {required ? <span className="text-[#8f7000]"> *</span> : null}
        {optional ? <span className="font-medium text-[#6b7468]"> (optional)</span> : null}
      </label>
      {children}
      {error ? <p id={`${id}-error`} className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
