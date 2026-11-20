import {
  buildSchoolSubmissionBody,
  collectUtmParams,
  mergeUtmParams,
  schoolIdContentType,
  schoolSignedUploadTarget,
  schoolVerificationApiBase,
  validateStatusLookup,
} from "@shared/schoolVerification.js";

const UTM_STORAGE_KEY = "osw-school-utms";
const LOOKUP_STORAGE_KEY = "osw-school-lookup";

type SchoolFields = {
  schoolName: string;
  schoolDistrict: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  orderReference: string;
  pickupOrPhone: "online_pickup" | "phone";
};

export type SchoolStatusResult = {
  status: string;
  discountCode: string | null;
  discountExpiresAt: string | null;
};

function apiBase() {
  return schoolVerificationApiBase({
    VITE_SCHOOL_VERIFICATION_API_BASE: import.meta.env.VITE_SCHOOL_VERIFICATION_API_BASE,
  });
}

function readStoredUtms() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadSchoolUtms(search: string) {
  const merged = mergeUtmParams(readStoredUtms(), collectUtmParams(search));
  if (Object.keys(merged).length > 0) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
}

export function rememberSchoolLookup(id: string, email: string) {
  sessionStorage.setItem(LOOKUP_STORAGE_KEY, JSON.stringify({ id, email }));
}

export function recallSchoolLookup() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LOOKUP_STORAGE_KEY) || "null");
    if (!parsed?.id || !parsed?.email) return null;
    return { id: String(parsed.id), email: String(parsed.email) };
  } catch {
    return null;
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function publicError(payload: { error?: unknown; message?: unknown }, fallback: string) {
  const message = payload?.error || payload?.message;
  if (typeof message !== "string") return fallback;
  if (message.length > 180) return fallback;
  if (/https?:|signed|token|password|stack/i.test(message)) return fallback;
  return message;
}

export async function submitSchoolVerification(file: File, fields: SchoolFields, utm: Record<string, string>) {
  const contentType = schoolIdContentType(file);
  if (!contentType) throw new Error("Upload a JPG, PNG, HEIC, or PDF.");

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(`${apiBase()}/api/school-verifications/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ filename: file.name, content_type: contentType, byte_size: file.size }),
    });
  } catch {
    throw new Error("We couldn't reach the verification service. Please try again or call us.");
  }

  const upload = await readJson(uploadResponse);
  const signedUrl = String(upload?.signed_upload_url || "");
  const path = String(upload?.path || "");
  const token = String(upload?.token || "");
  const maxBytes = Number(upload?.max_bytes);
  const uploadTarget = schoolSignedUploadTarget(signedUrl, token);
  if (!uploadResponse.ok || !path || !uploadTarget) {
    throw new Error(publicError(upload, "We couldn't start the upload. Please try again."));
  }
  if (Number.isFinite(maxBytes) && file.size > maxBytes) {
    throw new Error("That file is larger than 10 MB.");
  }

  const uploadType = String(upload?.content_type || contentType);
  const payload = new FormData();
  payload.append("cacheControl", "3600");
  payload.append("", file.type === uploadType ? file : new File([file], file.name, { type: uploadType }));

  let putResponse: Response;
  try {
    putResponse = await fetch(uploadTarget, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: payload,
    });
  } catch {
    throw new Error("The ID upload did not finish. Please try again.");
  }
  if (!putResponse.ok) {
    throw new Error("The ID upload did not finish. Please try again.");
  }

  let submitResponse: Response;
  try {
    submitResponse = await fetch(`${apiBase()}/api/school-verifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(buildSchoolSubmissionBody(fields, path, utm)),
    });
  } catch {
    throw new Error("We couldn't save the verification. Please try again or call us.");
  }
  const saved = await readJson(submitResponse);
  if (!submitResponse.ok || !saved?.id) {
    throw new Error(publicError(saved, "We couldn't save the verification. Please try again."));
  }
  return { id: String(saved.id), status: String(saved.status || "pending") };
}

export async function fetchSchoolStatus(id: string, email: string): Promise<SchoolStatusResult> {
  const lookup = validateStatusLookup({ id, email });
  if (!lookup.ok) throw new Error(lookup.errors.id || lookup.errors.email || "Check the reference and email.");

  const url = new URL(`${apiBase()}/api/school-verifications/${encodeURIComponent(lookup.id)}/status`);
  url.searchParams.set("contact_email", lookup.email);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("We couldn't check that verification. Please try again or call us.");
  }
  const body = await readJson(response);
  if (!response.ok || !body?.status) {
    throw new Error(publicError(body, "We couldn't find a verification for that reference and email."));
  }
  return {
    status: String(body.status),
    discountCode: body.discount_code ? String(body.discount_code) : null,
    discountExpiresAt: body.discount_expires_at ? String(body.discount_expires_at) : null,
  };
}
