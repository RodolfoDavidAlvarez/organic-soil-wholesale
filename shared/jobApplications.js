import { sswFrom } from './sswEmailFrom.js';

export const JOB_APPLICATION_BUCKET = 'job-applications';
export const JOB_APPLICATION_POSITION_SLUG = 'sales-representative';
export const JOB_APPLICATION_POSITION_TITLE = 'Sales Representative';
export const JOB_APPLICATION_SOURCE = 'www.organicsoilwholesale.com/careers/sales';
export const JOB_APPLICATION_POSITIONS = Object.freeze({
  'sales-representative': Object.freeze({
    slug: 'sales-representative',
    title: 'Sales Representative',
    source: 'www.organicsoilwholesale.com/careers/sales',
    applicationVersion: 2,
  }),
  'general-application': Object.freeze({
    slug: 'general-application',
    title: 'General Application',
    source: 'www.organicsoilwholesale.com/careers/general',
    applicationVersion: 3,
  }),
  'cdl-truck-driver': Object.freeze({
    slug: 'cdl-truck-driver',
    title: 'CDL Truck Driver',
    source: 'www.organicsoilwholesale.com/careers/truck-driver',
    applicationVersion: 4,
  }),
});
export const JOB_APPLICATION_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const JOB_APPLICATION_MAX_SUPPORTING_FILES = 5;

export const JOB_APPLICATION_ADMIN_RECIPIENTS = Object.freeze([
  { id: 'sabrina', name: 'Sabrina', email: 'sabrina@soilseedandwater.com' },
  { id: 'rodolfo', name: 'Rodolfo', email: 'ralvarez@soilseedandwater.com' },
  { id: 'mike-mcmahon', name: 'Mike McMahon', email: 'mike.mcmahon@agave-inc.com' },
]);

const FILE_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
});
const RESUME_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);
const SUPPORTING_EXTENSIONS = new Set(Object.keys(FILE_TYPES));
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ALLOWED = Object.freeze({
  employmentInterest: new Set(['Full-time', 'Part-time', 'Open to either']),
  phoenixAvailability: new Set(['Yes', 'No', 'Relocating to Phoenix']),
  congressAvailability: new Set(['Yes', 'No', 'Relocating or planning a commute']),
  reliableTransportation: new Set(['Yes', 'No', 'Would like to discuss']),
  workAuthorization: new Set(['Yes', 'No']),
  salesExperienceYears: new Set(['No experience yet', 'Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years']),
  commercialDrivingYears: new Set(['Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years']),
  gardeningExperienceYears: new Set(['New, but actively learning', 'Less than 1 year', '1–2 years', '3–5 years', '6–10 years', 'More than 10 years']),
  computerProficiency: new Set([
    'Beginner — I need regular guidance',
    'Basic — I can complete common tasks',
    'Comfortable — I learn most tools quickly',
    'Advanced — I often help others with technology',
  ]),
  gardeningFocus: new Set([
    'Home gardening',
    'Professional growing or farming',
    'Landscaping or plant care',
    'Nursery, greenhouse, or garden center',
    'Composting or worm farming',
    'Organic growing',
    'Soil biology or soil health',
    'Indoor growing or hydroponics',
    'Used Soil Seed & Water products',
  ]),
  computerSkills: new Set([
    'Email and digital calendars',
    'Data entry and online forms',
    'Spreadsheets',
    'CRM or lead-tracking software',
    'Point-of-sale or order-entry systems',
    'E-commerce or shipping portals',
    'Video meetings',
    'Social media and direct messages',
    'AI productivity tools',
  ]),
  preferredWorkAreas: new Set([
    'Sales and customer service',
    'Yard, warehouse, or production',
    'Delivery and driving',
    'Gardening, growing, or plant care',
    'Agronomy, soil science, or crop support',
    'Office and administration',
    'Marketing, content, or e-commerce',
    'Open to any suitable role',
  ]),
  educationLevel: new Set([
    'High school or GED',
    'Trade or technical program',
    'Some college',
    'Associate degree',
    'Bachelor’s degree',
    'Graduate degree',
    'Other or prefer not to say',
  ]),
  licensesCertifications: new Set([
    'Valid driver’s license',
    'CDL Class A',
    'CDL Class B',
    'Forklift certification',
    'Pesticide applicator license',
    'Agriculture, horticulture, or landscape certification',
    'Other professional certification',
  ]),
  equipmentSkills: new Set([
    'Tractor-trailer',
    'Walking-floor trailer',
    'End-dump or dump trailer',
    'Flatbed trailer',
    'Forklift',
    'Skid steer',
    'Front-end loader',
    'Tractor',
    'Dump trailer or towing',
    'Box truck or delivery vehicle',
    'Pallet jack',
    'Bagging, batching, or production equipment',
    'Hand and power tools',
    'Loading and securing bulk materials',
    'Pre-trip and post-trip inspections',
    'Basic vehicle maintenance',
    'No equipment experience yet',
  ]),
  physicalWorkReadiness: new Set([
    'Yes',
    'No',
    'Open to discussing the role requirements',
  ]),
  cdlClass: new Set(['Class A', 'Class B']),
  cdlEndorsements: new Set([
    'T — Double/triple trailers',
    'N — Tank vehicle',
    'H — Hazardous materials',
    'X — Tank and hazardous materials',
    'No endorsements',
  ]),
  dotMedicalCard: new Set(['Current', 'Can obtain before starting', 'Not current']),
  insurerEligibility: new Set(['Yes', 'Unsure', 'No']),
  manualTransmission: new Set(['Yes', 'Some experience', 'No']),
  driverTechnologySkills: new Set([
    'Smartphone navigation and maps',
    'Electronic logging device (ELD)',
    'Dispatch or route apps',
    'Digital inspection forms',
    'Proof-of-delivery photos or signatures',
    'Email and text communication',
  ]),
});

export class JobApplicationError extends Error {
  constructor(message, status = 400, code = 'invalid_application') {
    super(message);
    this.name = 'JobApplicationError';
    this.status = status;
    this.code = code;
  }
}

export const escapeJobApplicationHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const safeJobApplicationFileName = (fileName) => {
  const cleaned = String(fileName || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-160);
  return cleaned || 'document';
};

function assertApplicationId(applicationId) {
  const normalized = String(applicationId || '').trim();
  if (!UUID_V4.test(normalized)) {
    throw new JobApplicationError('Please refresh the page and try again.', 400, 'invalid_application_id');
  }
  return normalized.toLowerCase();
}

function jobApplicationPosition(positionSlug) {
  const slug = String(positionSlug || JOB_APPLICATION_POSITION_SLUG).trim();
  const position = JOB_APPLICATION_POSITIONS[slug];
  if (!position) throw new JobApplicationError('Please select a valid position.', 400, 'invalid_position');
  return position;
}

function extensionFor(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || '';
}

export function validateJobApplicationUpload(input) {
  const applicationId = assertApplicationId(input?.applicationId);
  const position = jobApplicationPosition(input?.positionSlug);
  const kind = input?.kind === 'resume' ? 'resume' : input?.kind === 'supporting' ? 'supporting' : null;
  if (!kind) throw new JobApplicationError('Invalid document type.', 400, 'invalid_document_type');

  const originalName = String(input?.name || '').trim();
  const extension = extensionFor(originalName);
  const acceptedExtensions = kind === 'resume' ? RESUME_EXTENSIONS : SUPPORTING_EXTENSIONS;
  if (!originalName || originalName.length > 200 || !acceptedExtensions.has(extension)) {
    throw new JobApplicationError(
      kind === 'resume'
        ? 'The resume must be a PDF, DOC, or DOCX file.'
        : 'Supporting documents must be PDF, DOC, DOCX, JPG, or PNG files.',
      400,
      'invalid_document_extension',
    );
  }

  const size = Number(input?.size);
  if (!Number.isInteger(size) || size < 1 || size > JOB_APPLICATION_MAX_FILE_BYTES) {
    throw new JobApplicationError('Each document must be 8 MB or smaller.', 400, 'invalid_document_size');
  }

  const contentType = String(input?.contentType || '').toLowerCase();
  if (contentType !== FILE_TYPES[extension]) {
    throw new JobApplicationError('The document type does not match its filename.', 400, 'invalid_document_content_type');
  }

  let index = null;
  if (kind === 'supporting') {
    index = Number(input?.index);
    if (!Number.isInteger(index) || index < 1 || index > JOB_APPLICATION_MAX_SUPPORTING_FILES) {
      throw new JobApplicationError('Invalid supporting document number.', 400, 'invalid_document_index');
    }
  }

  const prefix = kind === 'resume' ? 'resume' : `supporting-${index}`;
  const path = `${position.slug}/${applicationId}/${prefix}-${safeJobApplicationFileName(originalName)}`;
  return { applicationId, positionSlug: position.slug, kind, index, name: originalName, size, contentType, path };
}

function requiredText(value, label, min, max) {
  const normalized = String(value || '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new JobApplicationError(`${label} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalText(value, label, max) {
  const normalized = String(value || '').trim();
  if (normalized.length > max) throw new JobApplicationError(`${label} is too long.`);
  return normalized || null;
}

function allowedValue(value, key, label) {
  const normalized = String(value || '');
  if (!ALLOWED[key].has(normalized)) throw new JobApplicationError(`Please select a valid ${label}.`);
  return normalized;
}

function allowedList(value, key, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ALLOWED[key].size) {
    throw new JobApplicationError(`Please select at least one ${label}.`);
  }
  const normalized = [...new Set(value.map((item) => String(item)))];
  if (normalized.some((item) => !ALLOWED[key].has(item))) {
    throw new JobApplicationError(`Please select valid ${label}.`);
  }
  return normalized;
}

function allowedOptionalList(value, key, label) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return [];
  if (!Array.isArray(value) || value.length > ALLOWED[key].size) {
    throw new JobApplicationError(`Please select valid ${label}.`);
  }
  const normalized = [...new Set(value.map((item) => String(item)))];
  if (normalized.some((item) => !ALLOWED[key].has(item))) {
    throw new JobApplicationError(`Please select valid ${label}.`);
  }
  return normalized;
}

function normalizedDocument(raw, applicationId, positionSlug, kind, index = null) {
  const document = validateJobApplicationUpload({ ...raw, applicationId, positionSlug, kind, index });
  if (raw?.path !== document.path) {
    throw new JobApplicationError('A document path is invalid. Please attach the file again.', 400, 'invalid_document_path');
  }
  return document;
}

export function normalizeJobApplication(body) {
  if (String(body?.website || '').trim()) {
    throw new JobApplicationError('Unable to submit this application.', 400, 'bot_submission');
  }
  const applicationId = assertApplicationId(body?.applicationId);
  const position = jobApplicationPosition(body?.positionSlug);
  const form = body?.form && typeof body.form === 'object' ? body.form : {};
  const email = requiredText(form.email, 'Email', 3, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new JobApplicationError('Please enter a valid email address.');
  const phone = requiredText(form.phone, 'Phone', 7, 40);
  if (phone.replace(/\D/g, '').length < 7) throw new JobApplicationError('Please enter a valid phone number.');

  const earliestStartDate = String(form.earliestStartDate || '');
  const parsedStartDate = new Date(`${earliestStartDate}T00:00:00Z`);
  if (!ISO_DATE.test(earliestStartDate) || Number.isNaN(parsedStartDate.valueOf()) || parsedStartDate.toISOString().slice(0, 10) !== earliestStartDate) {
    throw new JobApplicationError('Please enter a valid earliest start date.');
  }

  let linkedInUrl = optionalText(form.linkedInUrl, 'LinkedIn URL', 500);
  if (linkedInUrl) {
    try {
      const parsed = new URL(linkedInUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      linkedInUrl = parsed.toString();
    } catch {
      throw new JobApplicationError('Please enter a valid LinkedIn or portfolio URL.');
    }
  }

  if (form.certification !== true) throw new JobApplicationError('Please certify your application before submitting.');

  const resume = normalizedDocument(body?.resume, applicationId, position.slug, 'resume');
  const rawSupporting = Array.isArray(body?.supportingDocuments) ? body.supportingDocuments : [];
  if (rawSupporting.length > JOB_APPLICATION_MAX_SUPPORTING_FILES) {
    throw new JobApplicationError(`Please choose no more than ${JOB_APPLICATION_MAX_SUPPORTING_FILES} supporting documents.`);
  }
  const supportingDocuments = rawSupporting.map((document, index) => normalizedDocument(document, applicationId, position.slug, 'supporting', index + 1));
  if (new Set([resume.path, ...supportingDocuments.map((document) => document.path)]).size !== supportingDocuments.length + 1) {
    throw new JobApplicationError('Duplicate document paths are not allowed.');
  }

  const isGeneralApplication = position.slug === 'general-application';
  const isDriverApplication = position.slug === 'cdl-truck-driver';
  const record = {
    id: applicationId,
    position_slug: position.slug,
    position_title: position.title,
    first_name: requiredText(form.firstName, 'First name', 1, 80),
    last_name: requiredText(form.lastName, 'Last name', 1, 80),
    preferred_name: optionalText(form.preferredName, 'Preferred name', 80),
    email,
    phone,
    city: requiredText(form.city, 'City', 1, 100),
    state: requiredText(form.state, 'State', 2, 2).toUpperCase(),
    linkedin_url: linkedInUrl,
    employment_interest: allowedValue(form.employmentInterest, 'employmentInterest', 'preferred schedule'),
    phoenix_availability: isDriverApplication ? null : allowedValue(form.phoenixAvailability, 'phoenixAvailability', 'Phoenix availability'),
    congress_availability: isDriverApplication
      ? allowedValue(form.congressAvailability, 'congressAvailability', 'Congress availability')
      : null,
    reliable_transportation: allowedValue(form.reliableTransportation, 'reliableTransportation', 'transportation answer'),
    work_authorization: allowedValue(form.workAuthorization, 'workAuthorization', 'work authorization answer'),
    earliest_start_date: earliestStartDate,
    compensation_expectation: optionalText(form.compensationExpectation, 'Compensation expectation', 160),
    sales_experience_years: isDriverApplication ? null : allowedValue(form.salesExperienceYears, 'salesExperienceYears', 'sales experience range'),
    sales_background: isDriverApplication ? null : requiredText(form.salesBackground, 'Sales background', 40, 1500),
    gardening_experience_years: isDriverApplication ? null : allowedValue(form.gardeningExperienceYears, 'gardeningExperienceYears', 'gardening experience range'),
    gardening_focus: isDriverApplication ? [] : allowedList(form.gardeningFocus, 'gardeningFocus', 'gardening focus area'),
    plants_grown: isDriverApplication ? null : requiredText(form.plantsGrown, 'Plants and growing experience', 20, 1200),
    organic_practices: isDriverApplication ? null : requiredText(form.organicPractices, 'Organic practices', 20, 1500),
    product_experience: isDriverApplication ? null : requiredText(form.productExperience, 'Product experience', 40, 1500),
    why_ssw: requiredText(form.whySsw, 'Reason for applying', 40, 1500),
    soil_knowledge: isDriverApplication ? null : requiredText(form.soilKnowledge, 'Soil knowledge answer', 40, 1500),
    computer_proficiency: allowedValue(form.computerProficiency, 'computerProficiency', 'computer proficiency'),
    computer_skills: isDriverApplication ? [] : allowedList(form.computerSkills, 'computerSkills', 'computer skill'),
    software_tools: requiredText(form.softwareTools, 'Software tools', 10, 1200),
    computer_task_example: requiredText(form.computerTaskExample, 'Computer task example', 40, 1500),
    sales_example: isDriverApplication ? null : requiredText(form.salesExample, 'Sales example', 40, 1500),
    referral_source: optionalText(form.referralSource, 'Referral source', 250),
    experience_tags: isDriverApplication
      ? allowedList(form.equipmentSkills, 'equipmentSkills', 'driving or equipment skill')
      : allowedList(form.gardeningFocus, 'gardeningFocus', 'experience tag'),
    preferred_work_areas: isGeneralApplication
      ? allowedList(form.preferredWorkAreas, 'preferredWorkAreas', 'preferred work area')
      : [],
    education_level: isGeneralApplication
      ? allowedValue(form.educationLevel, 'educationLevel', 'education level')
      : null,
    education_field: isGeneralApplication ? optionalText(form.educationField, 'Degree or field of study', 500) : null,
    licenses_certifications: isGeneralApplication
      ? allowedOptionalList(form.licensesCertifications, 'licensesCertifications', 'licenses and certifications')
      : [],
    equipment_skills: isGeneralApplication || isDriverApplication
      ? allowedList(form.equipmentSkills, 'equipmentSkills', 'equipment skill')
      : [],
    physical_work_readiness: isGeneralApplication || isDriverApplication
      ? allowedValue(form.physicalWorkReadiness, 'physicalWorkReadiness', 'outdoor and physical work answer')
      : null,
    commercial_driving_years: isDriverApplication
      ? allowedValue(form.commercialDrivingYears, 'commercialDrivingYears', 'commercial driving experience range')
      : null,
    cdl_class: isDriverApplication ? allowedValue(form.cdlClass, 'cdlClass', 'CDL class') : null,
    cdl_endorsements: isDriverApplication
      ? allowedOptionalList(form.cdlEndorsements, 'cdlEndorsements', 'CDL endorsements')
      : [],
    dot_medical_card: isDriverApplication
      ? allowedValue(form.dotMedicalCard, 'dotMedicalCard', 'DOT medical card answer')
      : null,
    insurer_eligibility: isDriverApplication
      ? allowedValue(form.insurerEligibility, 'insurerEligibility', 'driving-record answer')
      : null,
    manual_transmission_experience: isDriverApplication
      ? allowedValue(form.manualTransmission, 'manualTransmission', 'manual transmission answer')
      : null,
    driver_technology_skills: isDriverApplication
      ? allowedList(form.driverTechnologySkills, 'driverTechnologySkills', 'driver technology skill')
      : [],
    commercial_driving_background: isDriverApplication
      ? requiredText(form.commercialDrivingBackground, 'Commercial driving background', 40, 1500)
      : null,
    bulk_material_experience: isDriverApplication
      ? requiredText(form.bulkMaterialExperience, 'Bulk material experience', 40, 1500)
      : null,
    safety_example: isDriverApplication ? requiredText(form.safetyExample, 'Safety example', 40, 1500) : null,
    customer_delivery_example: isDriverApplication
      ? requiredText(form.customerDeliveryExample, 'Customer delivery example', 40, 1500)
      : null,
    resume_bucket: JOB_APPLICATION_BUCKET,
    resume_path: resume.path,
    additional_document_paths: supportingDocuments.map((document) => document.path),
    source: position.source,
    consent_to_contact: true,
    application_version: position.applicationVersion,
  };

  return { applicationId, record, resume, supportingDocuments };
}

export async function verifyJobApplicationDocuments(storage, documents) {
  await Promise.all(documents.map(async (document) => {
    const { data, error } = await storage.info(document.path);
    if (error || !data) {
      throw new JobApplicationError(`The uploaded document “${document.name}” could not be verified.`, 400, 'document_not_found');
    }
    if (Number(data.size) !== document.size || String(data.contentType || '').toLowerCase() !== document.contentType) {
      throw new JobApplicationError(`The uploaded document “${document.name}” did not match the selected file.`, 400, 'document_mismatch');
    }
  }));
}

function display(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value || '—';
}

function detailsTable(rows) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">${rows.map(([label, value]) => `<tr><th align="left" valign="top" style="width:34%;padding:8px;border-bottom:1px solid #dfe7e1;color:#183a23">${escapeJobApplicationHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #dfe7e1;color:#334155;white-space:pre-wrap">${escapeJobApplicationHtml(display(value))}</td></tr>`).join('')}</table>`;
}

export function buildApplicantConfirmationEmail(record) {
  const name = record.preferred_name || record.first_name;
  const positionTitle = record.position_title || JOB_APPLICATION_POSITION_TITLE;
  const applicantSubject = positionTitle === 'General Application'
    ? 'We received your General Application'
    : `We received your ${positionTitle} application`;
  const submissionDescription = positionTitle === 'General Application'
    ? 'general application'
    : `application for the ${positionTitle} position`;
  return {
    from: sswFrom('Soil Seed & Water'),
    replyTo: 'ralvarez@soilseedandwater.com',
    to: record.email,
    subject: applicantSubject,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#24352a;max-width:640px;margin:auto"><h1 style="color:#183a23">Application received</h1><p>Hi ${escapeJobApplicationHtml(name)},</p><p>Thank you for submitting your ${escapeJobApplicationHtml(submissionDescription)} with Soil Seed &amp; Water. Your application and documents were received successfully.</p><p>Our team will review your experience and contact you if there is a fit for a current or future opportunity.</p><p>Questions? Reply to this email or call <a href="tel:+16232633386">(623) 263-3386</a>.</p><p>Soil Seed &amp; Water<br><a href="https://www.organicsoilwholesale.com">www.organicsoilwholesale.com</a></p></div>`,
    text: `Hi ${name},\n\nThank you for submitting your ${submissionDescription} with Soil Seed & Water. Your application and documents were received successfully. Our team will review your experience and contact you if there is a fit for a current or future opportunity.\n\nQuestions? Reply to this email or call (623) 263-3386.`,
  };
}

export function buildAdminApplicationEmail(record, documentLinks) {
  const applicantName = `${record.first_name} ${record.last_name}`;
  const positionTitle = record.position_title || JOB_APPLICATION_POSITION_TITLE;
  const links = documentLinks.map((document) => `<li style="margin:8px 0"><a href="${escapeJobApplicationHtml(document.url)}">${escapeJobApplicationHtml(document.label)}</a> <span style="color:#64748b">(private link expires in 7 days)</span></li>`).join('');
  const commonRows = [
    ['Applicant', applicantName], ['Email', record.email], ['Phone', record.phone], ['Location', `${record.city}, ${record.state}`],
    ['Preferred schedule', record.employment_interest], ['Reliable transportation', record.reliable_transportation],
    ['Work authorization', record.work_authorization], ['Earliest start', record.earliest_start_date], ['Compensation expectation', record.compensation_expectation],
    ['Why Soil Seed & Water', record.why_ssw],
  ];
  const roleRows = record.position_slug === 'cdl-truck-driver' ? [
    ['Congress work availability', record.congress_availability], ['Commercial driving experience', record.commercial_driving_years],
    ['CDL class', record.cdl_class], ['CDL endorsements', record.cdl_endorsements], ['DOT medical card', record.dot_medical_card],
    ['Can meet insurer driving requirements', record.insurer_eligibility], ['Manual transmission experience', record.manual_transmission_experience],
    ['Driving and equipment skills', record.equipment_skills], ['Outdoor / physical work interest', record.physical_work_readiness],
    ['Commercial driving background', record.commercial_driving_background], ['Bulk material experience', record.bulk_material_experience],
    ['Safety example', record.safety_example], ['Customer delivery example', record.customer_delivery_example],
    ['Driver technology skills', record.driver_technology_skills], ['Software and tools', record.software_tools],
    ['Dispatch and documentation answer', record.computer_task_example],
  ] : [
    ['Phoenix availability', record.phoenix_availability],
    ['Sales experience', record.sales_experience_years], ['Sales background', record.sales_background],
    ['Gardening experience', record.gardening_experience_years], ['Gardening focus', record.gardening_focus], ['Plants and environments', record.plants_grown],
    ['Organic practices', record.organic_practices], ['Product experience', record.product_experience], ['Soil biology answer', record.soil_knowledge],
    ['Computer proficiency', record.computer_proficiency], ['Computer skills', record.computer_skills], ['Software and tools', record.software_tools],
    ['Follow-up workflow answer', record.computer_task_example], ['Customer trust example', record.sales_example], ['Referral source', record.referral_source],
    ['Preferred work areas', record.preferred_work_areas], ['Education level', record.education_level], ['Degree or field of study', record.education_field],
    ['Licenses and certifications', record.licenses_certifications], ['Equipment skills', record.equipment_skills], ['Outdoor / physical work interest', record.physical_work_readiness],
  ];
  const rows = [...commonRows, ...roleRows, ['Referral source', record.referral_source], ['LinkedIn / portfolio', record.linkedin_url], ['Application ID', record.id]];
  return {
    from: sswFrom('Soil Seed & Water Careers'),
    replyTo: record.email,
    subject: `New ${positionTitle} — ${applicantName}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#24352a;max-width:760px;margin:auto"><h1 style="color:#183a23">New ${escapeJobApplicationHtml(positionTitle)}</h1><p><strong>${escapeJobApplicationHtml(applicantName)}</strong> submitted a complete application.</p><h2 style="color:#183a23">Private documents</h2><ul>${links}</ul>${detailsTable(rows)}<p style="color:#64748b">Submitted through ${escapeJobApplicationHtml(record.source || JOB_APPLICATION_SOURCE)}.</p></div>`,
    text: `New ${positionTitle} from ${applicantName}.\n\nEmail: ${record.email}\nPhone: ${record.phone}\nLocation: ${record.city}, ${record.state}\n\nPrivate document links:\n${documentLinks.map((document) => `${document.label}: ${document.url}`).join('\n')}\n\nApplication ID: ${record.id}`,
  };
}

async function sendEmail(resend, payload, idempotencyKey) {
  const result = await resend.emails.send(payload, { idempotencyKey });
  if (result?.error || !result?.data?.id) throw new Error(result?.error?.message || 'Email provider did not accept the message.');
  return result.data.id;
}

export async function sendJobApplicationNotifications({ resend, record, documentLinks, prior = {} }) {
  const providerIds = { ...(prior.adminProviderIds || {}) };
  const jobs = [];
  if (prior.applicantStatus !== 'sent') {
    jobs.push({
      type: 'applicant',
      promise: sendEmail(resend, buildApplicantConfirmationEmail(record), `job-application-${record.id}-applicant`),
    });
  }
  for (const recipient of JOB_APPLICATION_ADMIN_RECIPIENTS) {
    if (providerIds[recipient.id]) continue;
    jobs.push({
      type: 'admin',
      recipient,
      promise: sendEmail(
        resend,
        { ...buildAdminApplicationEmail(record, documentLinks), to: recipient.email },
        `job-application-${record.id}-admin-${recipient.id}`,
      ),
    });
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  let applicantProviderId = prior.applicantProviderId || null;
  const errors = [];
  settled.forEach((result, index) => {
    const job = jobs[index];
    if (result.status === 'fulfilled') {
      if (job.type === 'applicant') applicantProviderId = result.value;
      else providerIds[job.recipient.id] = result.value;
    } else {
      errors.push(`${job.type === 'applicant' ? 'applicant' : job.recipient.id}: ${result.reason?.message || String(result.reason)}`);
    }
  });

  return {
    applicantStatus: applicantProviderId ? 'sent' : 'failed',
    applicantProviderId,
    adminStatus: JOB_APPLICATION_ADMIN_RECIPIENTS.every((recipient) => providerIds[recipient.id]) ? 'sent' : Object.keys(providerIds).length ? 'partial' : 'failed',
    adminProviderIds: providerIds,
    errors,
  };
}

async function privateDocumentLinks(storage, documents) {
  const links = await Promise.all(documents.map(async (document, index) => {
    const { data, error } = await storage.createSignedUrl(document.path, 7 * 24 * 60 * 60, { download: document.name });
    if (error || !data?.signedUrl) throw new Error(`Could not create a private link for ${document.name}.`);
    return { label: index === 0 ? `Resume — ${document.name}` : `Supporting document ${index} — ${document.name}`, url: data.signedUrl };
  }));
  return links;
}

function sameExistingApplication(existing, normalized) {
  return existing.position_slug === normalized.record.position_slug
    && existing.email === normalized.record.email
    && existing.resume_path === normalized.record.resume_path
    && JSON.stringify(existing.additional_document_paths || []) === JSON.stringify(normalized.record.additional_document_paths);
}

export async function processJobApplication({ db, resend, body }) {
  const normalized = normalizeJobApplication(body);
  const storage = db.storage.from(JOB_APPLICATION_BUCKET);
  const documents = [normalized.resume, ...normalized.supportingDocuments];
  await verifyJobApplicationDocuments(storage, documents);

  const { data: existing, error: lookupError } = await db.from('job_applications')
    .select('*').eq('id', normalized.applicationId).maybeSingle();
  if (lookupError) throw lookupError;
  let saved = existing;
  if (existing && !sameExistingApplication(existing, normalized)) {
    throw new JobApplicationError('This application could not be retried safely. Please refresh the page.', 409, 'application_conflict');
  }
  if (!existing) {
    const { data, error } = await db.from('job_applications').insert(normalized.record).select('*').single();
    if (error) throw error;
    saved = data;
  }

  let documentLinks = Array.isArray(saved.notification_document_links) ? saved.notification_document_links : [];
  const reusableLinks = documentLinks.length === documents.length
    && documentLinks.every((link) => typeof link?.label === 'string' && typeof link?.url === 'string' && link.url.startsWith('https://'));
  if (!reusableLinks) {
    documentLinks = await privateDocumentLinks(storage, documents);
    const { error: linkUpdateError } = await db.from('job_applications')
      .update({ notification_document_links: documentLinks, updated_at: new Date().toISOString() })
      .eq('id', normalized.applicationId);
    if (linkUpdateError) throw linkUpdateError;
    saved.notification_document_links = documentLinks;
  }
  const delivery = await sendJobApplicationNotifications({
    resend,
    record: saved,
    documentLinks,
    prior: {
      applicantStatus: saved.applicant_confirmation_status,
      applicantProviderId: saved.applicant_confirmation_provider_id,
      adminProviderIds: saved.admin_notification_provider_ids || {},
    },
  });

  const now = new Date().toISOString();
  const updates = {
    applicant_confirmation_status: delivery.applicantStatus,
    applicant_confirmation_provider_id: delivery.applicantProviderId,
    applicant_confirmation_sent_at: delivery.applicantStatus === 'sent' ? (saved.applicant_confirmation_sent_at || now) : null,
    admin_notification_status: delivery.adminStatus,
    admin_notification_provider_ids: delivery.adminProviderIds,
    admin_notification_sent_at: delivery.adminStatus === 'sent' ? (saved.admin_notification_sent_at || now) : null,
    notification_last_error: delivery.errors.length ? delivery.errors.join(' | ').slice(0, 2000) : null,
    updated_at: now,
  };
  const { error: updateError } = await db.from('job_applications').update(updates).eq('id', normalized.applicationId);
  if (updateError) throw updateError;

  if (delivery.errors.length) {
    throw new JobApplicationError('Your application was saved, but a confirmation could not be delivered. Please try once more.', 502, 'notification_failed');
  }
  return { ok: true, applicationId: normalized.applicationId, applicantConfirmation: 'sent', adminNotifications: 'sent' };
}

export async function cleanupUnsavedJobApplication({ db, applicationId, positionSlug }) {
  const id = assertApplicationId(applicationId);
  const position = jobApplicationPosition(positionSlug);
  const { data: existing, error: lookupError } = await db.from('job_applications').select('id').eq('id', id).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) throw new JobApplicationError('Saved application documents cannot be removed here.', 409, 'application_saved');

  const storage = db.storage.from(JOB_APPLICATION_BUCKET);
  const folder = `${position.slug}/${id}`;
  const { data: files, error: listError } = await storage.list(folder, { limit: 10 });
  if (listError) throw listError;
  const paths = (files || []).filter((file) => file?.name && file.id).map((file) => `${folder}/${file.name}`);
  if (paths.length) {
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw removeError;
  }
  return { ok: true, removed: paths.length };
}
