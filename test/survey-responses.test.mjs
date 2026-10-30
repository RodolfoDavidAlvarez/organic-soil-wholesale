import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SURVEY_COUPON_LABEL,
  SURVEY_COUPON_OFFER,
  SURVEY_COUPON_RESTRICTIONS,
  SURVEY_COUPON_VALID_DAYS,
  SURVEY_KIND_GARDEN_CLASS,
  SURVEY_KIND_PURCHASE,
  SURVEY_SOURCE,
  GARDEN_CLASS_EVENT_KEY,
  buildPublicSurveyCoupon,
  generateSurveyCouponCode,
  isSurveyCouponCode,
  listSurveyInbox,
  normalizeSurveyResponse,
  parseSurveyCouponQrRequest,
  readGardenClassSurveyPrefill,
  readSurveyPrefill,
  saveSurveyResponse,
  surveyCouponExpiresAt,
  surveyCouponQrPath,
  validateSurveyResponse,
} from "../shared/surveyResponses.js";
import {
  STAFF_CLASS_SURVEY_SUBJECT,
  STAFF_CLASS_SURVEY_THREAD_ID,
  STAFF_YARD_SURVEY_SUBJECT,
  STAFF_YARD_SURVEY_THREAD_ID,
  getSurveyAlertRecipients,
  processSurveySubmission,
} from "../shared/surveyStaffAlerts.js";
import {
  SURVEY_SUBMIT_POST_PATHS,
  isSurveySubmitPostPath,
} from "../shared/surveySubmitPaths.js";
import {
  STAFF_GARDEN_CLASS_SUBJECT,
  STAFF_GARDEN_CLASS_THREAD_ID,
  STAFF_NEWSLETTER_THREAD_ID,
  STAFF_SIGNUP_SUBJECT,
} from "../shared/newsletterNotifications.js";

function createSurveyDb({ customerId = 42 } = {}) {
  const rows = [];
  return {
    rows,
    from(table) {
      if (table === "sp_customers") {
        return {
          select() { return this; },
          ilike() { return this; },
          limit: async () => ({
            data: customerId == null ? [] : [{ id: customerId }],
            error: customerId == null ? { message: "no match" } : null,
          }),
        };
      }
      if (table === "sp_survey_responses") {
        const state = { filters: {}, notNull: null, insertRow: null, orderCol: null, orderAsc: false, limitN: null };
        const matches = (row) => {
          for (const [col, val] of Object.entries(state.filters)) {
            if (row[col] !== val) return false;
          }
          if (state.notNull && (row[state.notNull] == null || row[state.notNull] === "")) return false;
          return true;
        };
        const snapshot = () => {
          let result = rows.filter(matches);
          if (state.orderCol) {
            result = [...result].sort((a, b) => {
              const av = a[state.orderCol];
              const bv = b[state.orderCol];
              if (av < bv) return state.orderAsc ? -1 : 1;
              if (av > bv) return state.orderAsc ? 1 : -1;
              return 0;
            });
          }
          if (state.limitN != null) result = result.slice(0, state.limitN);
          if (state.selectCols === "survey_kind") {
            result = result.map((row) => ({ survey_kind: row.survey_kind }));
          }
          return { data: result, error: null };
        };
        const api = {
          select(cols) { state.selectCols = cols; return api; },
          eq(col, val) { state.filters[col] = val; return api; },
          not(col, kind, val) {
            if (kind === "is" && val == null) state.notNull = col;
            return api;
          },
          order(col, { ascending } = {}) {
            state.orderCol = col;
            state.orderAsc = Boolean(ascending);
            return api;
          },
          limit(n) {
            state.limitN = n;
            return api;
          },
          insert(row) {
            state.insertRow = row;
            return api;
          },
          update(row) {
            state.updateRow = row;
            return {
              eq: async (col, val) => {
                const match = rows.find((existing) => existing[col] === val);
                if (match) Object.assign(match, row);
                return { data: match || null, error: null };
              },
            };
          },
          then(resolve, reject) {
            return Promise.resolve(snapshot()).then(resolve, reject);
          },
          maybeSingle: async () => {
            const match = rows.filter(matches);
            if (match.length > 1) {
              return {
                data: null,
                error: {
                  code: "PGRST116",
                  message: "JSON object requested, multiple (or no) rows returned",
                },
              };
            }
            return { data: match[0] || null, error: null };
          },
          single: async () => {
            if (!state.insertRow) {
              const match = rows.find(matches);
              return { data: match || null, error: match ? null : { message: "not found" } };
            }
            const row = state.insertRow;
            if (row.coupon_code && rows.some((existing) => existing.email_normalized === row.email_normalized && existing.coupon_code)) {
              return {
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "sp_survey_responses_one_coupon_per_email_idx"',
                },
              };
            }
            if (row.coupon_code && rows.some((existing) => existing.coupon_code === row.coupon_code)) {
              return {
                data: null,
                error: {
                  code: "23505",
                  message: 'duplicate key value violates unique constraint "sp_survey_responses_coupon_code_idx"',
                },
              };
            }
            const saved = {
              id: `row-${rows.length + 1}`,
              created_at: "2026-08-19T00:00:00.000Z",
              customer_id: row.customer_id ?? null,
              coupon_code: null,
              coupon_issued_at: null,
              coupon_expires_at: null,
              coupon_redeemed_at: null,
              survey_kind: "purchase",
              event_key: null,
              scores: {},
              notes: null,
              ...row,
            };
            rows.push(saved);
            return { data: saved, error: null };
          },
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const validAnswers = {
  firstName: "Jordan",
  email: "jordan@example.com",
  experienceScore: 8,
  findingUs: 7,
  comeBack: 9,
  workedWell: ["Staff", "Loading / pickup"],
  improveMost: "Signs / directions",
  notes: "Pickup was quick.",
};

test("honeypot submissions look successful and never write", async () => {
  const validation = validateSurveyResponse({
    firstName: "Bot",
    email: "bot@example.com",
    visitFeedback: "spam",
    website: "https://example.com",
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.bot, true);
});

test("requires first name, email, and the three yard scores", () => {
  assert.equal(validateSurveyResponse({ email: "a@b.com", experienceScore: 8, findingUs: 7, comeBack: 9 }).ok, false);
  assert.equal(validateSurveyResponse({ firstName: "Alex", experienceScore: 8, findingUs: 7, comeBack: 9 }).ok, false);
  assert.equal(validateSurveyResponse({ firstName: "Alex", email: "not-an-email", experienceScore: 8, findingUs: 7, comeBack: 9 }).ok, false);
  assert.equal(validateSurveyResponse({ firstName: "Alex", email: "alex@example.com" }).ok, false);
  assert.equal(validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    visitFeedback: "Yard was easy.",
  }).ok, false);
  const ok = validateSurveyResponse({
    firstName: "Alex",
    email: "Alex@Example.com",
    experienceScore: 8,
    findingUs: 6,
    comeBack: 9,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.bot, false);
  assert.equal(ok.response.email, "alex@example.com");
  assert.equal(ok.response.source, SURVEY_SOURCE);
  assert.equal(ok.response.surveyKind, SURVEY_KIND_PURCHASE);
  assert.equal(ok.response.eventKey, "");
  assert.equal(ok.response.experienceScore, 8);
  assert.equal(ok.response.findingUs, "6");
  assert.equal(ok.response.comeBack, 9);
  assert.equal(ok.response.notes, "");
});

test("untouched slider defaults of 5 and high scores of 8-10 are valid", () => {
  const untouched = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    experienceScore: 5,
    findingUs: 5,
    comeBack: 5,
  });
  assert.equal(untouched.ok, true);
  assert.equal(untouched.response.experienceScore, 5);
  assert.equal(untouched.response.findingUs, "5");
  assert.equal(untouched.response.comeBack, 5);

  const high = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    experienceScore: 10,
    findingUs: 8,
    comeBack: 9,
  });
  assert.equal(high.ok, true);
  assert.equal(high.response.experienceScore, 10);
  assert.equal(high.response.findingUs, "8");
  assert.equal(high.response.comeBack, 9);
});

test("phone is optional but validated when present", () => {
  const blank = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    experienceScore: 8,
    findingUs: 7,
    comeBack: 9,
  });
  assert.equal(blank.ok, true);
  const bad = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    phone: "123",
    experienceScore: 8,
    findingUs: 7,
    comeBack: 9,
  });
  assert.equal(bad.ok, false);
  const good = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    phone: "(623) 555-1212",
    experienceScore: 8,
    findingUs: 7,
    comeBack: 9,
  });
  assert.equal(good.ok, true);
});

test("source stays on the osw-survey namespace", () => {
  assert.equal(normalizeSurveyResponse({}).source, SURVEY_SOURCE);
  assert.equal(normalizeSurveyResponse({ source: "osw-survey:qr" }).source, "osw-survey:qr");
  assert.equal(normalizeSurveyResponse({ source: "gate-sign" }).source, "osw-survey:gate-sign");
});

test("garden class survey keeps source garden-class-2026-08 and does not prefix osw-survey", () => {
  assert.equal(normalizeSurveyResponse({ source: "garden-class-2026-08" }).source, "garden-class-2026-08");
  assert.equal(normalizeSurveyResponse({ source: "garden-class" }).source, "garden-class-2026-08");
  assert.equal(normalizeSurveyResponse({ source: "osw-survey:garden-class-2026-08" }).source, "garden-class-2026-08");
});

test("inserts a row with a unique coupon and allows repeat answers without a second code", async () => {
  const db = createSurveyDb();
  const first = validateSurveyResponse(validAnswers, { userAgent: "SurveyTest/1.0" });
  const saved = await saveSurveyResponse({
    db,
    response: first.response,
    now: new Date("2026-08-19T17:00:00.000Z"),
    createCouponCode: () => "SSW30-ABCD2EFG",
  });

  assert.equal(saved.response.customer_id, 42);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].source, SURVEY_SOURCE);
  assert.equal(db.rows[0].user_agent, "SurveyTest/1.0");
  assert.equal(db.rows[0].survey_kind, SURVEY_KIND_PURCHASE);
  assert.equal(db.rows[0].event_key, null);
  assert.equal(db.rows[0].notes, "Pickup was quick.");
  assert.equal(db.rows[0].experience_score, 8);
  assert.equal(db.rows[0].finding_us, "7");
  assert.deepEqual(db.rows[0].worked_well, ["Staff", "Loading / pickup"]);
  assert.equal(db.rows[0].improve_most, "Signs / directions");
  assert.equal(db.rows[0].would_come_back, "9");
  assert.equal(db.rows[0].scores.experience, 8);
  assert.equal(db.rows[0].scores.findingUs, 7);
  assert.equal(db.rows[0].scores.comeBack, 9);
  assert.equal(db.rows[0].visit_feedback, "Experience 8/10. Finding us 7/10. Come back 9/10.");
  assert.equal("newsletter_subscribed" in db.rows[0], false);
  assert.equal(saved.coupon, null);
  assert.equal(db.rows[0].coupon_code, null);

  const second = await saveSurveyResponse({
    db,
    response: first.response,
    now: new Date("2026-08-20T17:00:00.000Z"),
  });
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[1].coupon_code, null);
  assert.equal(second.coupon, null);
});

test("yard survey comment can be blank and still writes finding_us", async () => {
  const db = createSurveyDb();
  const validation = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    source: "apology-2026-08",
    experienceScore: 4,
    findingUs: 2,
    comeBack: 5,
    workedWell: ["Finding the yard / entrance"],
    improveMost: "Finding the yard / entrance",
    notes: "",
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.response.notes, "");
  assert.equal(validation.response.source, "osw-survey:apology-2026-08");
  const saved = await saveSurveyResponse({
    db,
    response: validation.response,
  });
  assert.equal(saved.coupon, null);
  assert.equal(db.rows[0].experience_score, 4);
  assert.equal(db.rows[0].finding_us, "2");
  assert.deepEqual(db.rows[0].worked_well, ["Finding the yard / entrance"]);
  assert.equal(db.rows[0].improve_most, "Finding the yard / entrance");
  assert.equal(db.rows[0].would_come_back, "5");
  assert.equal(db.rows[0].notes, null);
  assert.equal(db.rows[0].survey_kind, SURVEY_KIND_PURCHASE);
  assert.equal(db.rows[0].source, "osw-survey:apology-2026-08");
  assert.equal(db.rows[0].coupon_code, null);
});

test("yard survey prefill reads first_name and email", () => {
  assert.deepEqual(
    readSurveyPrefill("?source=apology-2026-08&first_name=Haylee&email=haylee@example.com"),
    { firstName: "Haylee", email: "haylee@example.com" },
  );
  assert.deepEqual(
    readSurveyPrefill("?first_name=Rodo&email=ralvarez@soilseedandwater.com"),
    { firstName: "Rodo", email: "ralvarez@soilseedandwater.com" },
  );
  assert.equal(readSurveyPrefill("?firstName=Haylee&email=haylee@example.com").firstName, "Haylee");
  assert.equal(readSurveyPrefill("?name=Haylee%20Smith&email=haylee@example.com").firstName, "Haylee");
});

test("an existing coupon is not shown or reissued", async () => {
  const db = createSurveyDb();
  db.rows.push(
    {
      id: "dup-1",
      first_name: "Jordan",
      email: "jordan@example.com",
      email_normalized: "jordan@example.com",
      coupon_code: "SSW30-FIRSTAAA",
      coupon_issued_at: "2026-08-01T00:00:00.000Z",
      coupon_expires_at: "2026-08-31T00:00:00.000Z",
      coupon_redeemed_at: null,
    },
    {
      id: "dup-2",
      first_name: "Jordan",
      email: "jordan@example.com",
      email_normalized: "jordan@example.com",
      coupon_code: "SSW30-SECONDBB",
      coupon_issued_at: "2026-08-02T00:00:00.000Z",
      coupon_expires_at: "2026-09-01T00:00:00.000Z",
      coupon_redeemed_at: null,
    },
  );
  const saved = await saveSurveyResponse({
    db,
    response: validateSurveyResponse(validAnswers).response,
  });
  assert.equal(saved.coupon, null);
  assert.equal(db.rows.length, 3);
  assert.equal(db.rows[2].coupon_code, null);
});

test("a second email also gets no coupon code", async () => {
  const db = createSurveyDb();
  const jordan = validateSurveyResponse(validAnswers);
  const sam = validateSurveyResponse({
    firstName: "Sam",
    email: "sam@example.com",
    experienceScore: 7,
    findingUs: 5,
    comeBack: 8,
    notes: "First time at the yard.",
  });
  const first = await saveSurveyResponse({
    db,
    response: jordan.response,
  });
  const second = await saveSurveyResponse({
    db,
    response: sam.response,
  });
  assert.equal(first.coupon, null);
  assert.equal(second.coupon, null);
  assert.equal(db.rows.filter((row) => row.coupon_code).length, 0);
});

test("survey submit does not generate a coupon code", async () => {
  const db = createSurveyDb();
  await saveSurveyResponse({
    db,
    response: validateSurveyResponse(validAnswers).response,
  });
  let calls = 0;
  const other = validateSurveyResponse({
    firstName: "Sam",
    email: "sam@example.com",
    visitFeedback: "Good yard.",
    experienceScore: 8,
    findingUs: 7,
    comeBack: 9,
  });
  const saved = await saveSurveyResponse({
    db,
    response: other.response,
    createCouponCode() {
      calls += 1;
      return "SSW30-SHOULDNT";
    },
  });
  assert.equal(calls, 0);
  assert.equal(saved.coupon, null);
  assert.equal(db.rows.every((row) => row.coupon_code == null), true);
});

test("missing customer rows do not fail the insert", async () => {
  const db = createSurveyDb({ customerId: null });
  const validation = validateSurveyResponse({
    firstName: "Sam",
    email: "new-neighbor@example.com",
    experienceScore: 8,
    findingUs: 6,
    comeBack: 9,
    notes: "First time at the yard.",
  });
  const saved = await saveSurveyResponse({
    db,
    response: validation.response,
  });
  assert.equal(saved.response.customer_id, null);
  assert.equal(saved.coupon, null);
});

test("coupon helpers match the worm-castings QR style and 90-day window", () => {
  assert.equal(isSurveyCouponCode("SSW30-ABCD2EFG"), true);
  assert.equal(isSurveyCouponCode("SSW30-ABCD0EFG"), false);
  assert.equal(parseSurveyCouponQrRequest("SSW30-ABCD2EFG.png")?.code, "SSW30-ABCD2EFG");
  assert.equal(parseSurveyCouponQrRequest("not-a-coupon.png"), null);
  assert.equal(surveyCouponQrPath("ssw30-abcd2efg"), "/api/public/survey-coupon/qr/SSW30-ABCD2EFG.png");
  assert.equal(
    surveyCouponExpiresAt(new Date("2026-08-19T17:00:00.000Z")).toISOString(),
    "2026-11-17T17:00:00.000Z",
  );
  assert.equal(SURVEY_COUPON_VALID_DAYS, 90);
  const publicCoupon = buildPublicSurveyCoupon({
    first_name: "Jordan",
    email: "jordan@example.com",
    coupon_code: "SSW30-ABCD2EFG",
    coupon_issued_at: "2026-08-19T17:00:00.000Z",
    coupon_expires_at: "2026-09-18T17:00:00.000Z",
    coupon_redeemed_at: null,
  });
  assert.equal(publicCoupon.label, "SSW survey thank-you");
  assert.match(publicCoupon.offer, /30% off one item, one time, Phoenix yard pickup/);
});

test("generated codes stay unique enough and skip ambiguous characters", () => {
  const codes = new Set(Array.from({ length: 80 }, () => generateSurveyCouponCode()));
  assert.equal(codes.size, 80);
  for (const code of codes) {
    assert.equal(isSurveyCouponCode(code), true);
    assert.doesNotMatch(code.slice(6), /[01IOL]/);
  }
});

test("survey coupon QR is issued only for a real code", async () => {
  const { buildSurveyCouponQr } = await import("../shared/surveyCouponQr.js");
  const missing = await buildSurveyCouponQr({
    db: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    },
    fileName: "SSW30-ABCD2EFG.png",
  });
  assert.equal(missing.status, 404);

  const found = await buildSurveyCouponQr({
    db: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: "row-1" }, error: null }),
        };
      },
    },
    fileName: "SSW30-ABCD2EFG.png",
  });
  assert.equal(found.status, 200);
  assert.equal(found.contentType, "image/png");
  assert.ok(Buffer.isBuffer(found.body));
  assert.ok(found.body.length > 100);
});

test("survey write path never touches newsletter subscribe or emails Dan Nowell", async () => {
  const survey = await readFile(new URL("../shared/surveyResponses.js", import.meta.url), "utf8");
  const qr = await readFile(new URL("../shared/surveyCouponQr.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/routes/survey.ts", import.meta.url), "utf8");
  const staff = await readFile(new URL("../shared/surveyStaffAlerts.js", import.meta.url), "utf8");
  const newsletter = await readFile(new URL("../server/routes/newsletter.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../client/src/pages/ClientSurvey.tsx", import.meta.url), "utf8");
  const slider = await readFile(new URL("../client/src/components/survey/ScoreSlider.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../client/src/index.css", import.meta.url), "utf8");
  const api = await readFile(new URL("../api/index.js", import.meta.url), "utf8");
  const notifications = await readFile(new URL("../shared/newsletterNotifications.js", import.meta.url), "utf8");
  assert.doesNotMatch(survey, /newsletter/i);
  assert.doesNotMatch(qr, /newsletter/i);
  assert.doesNotMatch(route, /newsletter\/subscribe/);
  assert.doesNotMatch(page, /newsletter\/subscribe/);
  assert.doesNotMatch(newsletter, /sp_survey_responses/);
  assert.doesNotMatch(survey, /nowell/i);
  assert.doesNotMatch(route, /nowell/i);
  assert.doesNotMatch(page, /nowell/i);
  assert.doesNotMatch(page, /Founder/);
  assert.doesNotMatch(page, /\u2014|\u2013/);
  assert.doesNotMatch(notifications, /nowell/i);
  assert.match(api, /coupon: result\.coupon|processSurveySubmission/);
  assert.match(api, /survey-coupon/);
  assert.match(page, /A fast survey for honest feedback/);
  assert.match(page, /This one is on us/);
  assert.doesNotMatch(page, /Three quick taps/);
  assert.doesNotMatch(page, /Finish this and a free 50 pound/);
  assert.match(page, /window\.location\.search/);
  assert.match(slider, /type="range"/);
  assert.match(slider, /garden-score-slider/);
  assert.match(css, /width: 32px/);
  assert.match(css, /height: 8px/);
  assert.doesNotMatch(page, /survey-phone/);
  assert.doesNotMatch(page, /setPhone/);
  assert.doesNotMatch(page, /\bphone,/);
  assert.match(page, /This is you\? Change it if not\./);
  assert.match(page, /ssw-logo-letter\.png/);
  assert.match(survey, /finding_us: response\.findingUs/);
  assert.match(survey, /experience_score: response\.experienceScore/);
  assert.match(survey, /worked_well:/);
  assert.doesNotMatch(page, /2 minutes/);
  assert.doesNotMatch(page, /about one minute/i);
  assert.doesNotMatch(page, /takes under a minute/i);
  assert.doesNotMatch(page, /minute/);
  assert.match(survey, /SSW survey thank-you/);
  assert.doesNotMatch(page, /coupon\.label/);
  assert.doesNotMatch(page, /coupon\.qrUrl/);
  assert.doesNotMatch(page, /SSW30/);
  assert.doesNotMatch(page, /30%/);
  assert.doesNotMatch(survey, /resend/i);
  assert.match(route, /processSurveySubmission/);
  assert.match(staff, /resend/i);
  assert.match(staff, /STAFF_YARD_SURVEY_SUBJECT/);
  assert.match(staff, /ADMIN_TEAM/);
  assert.doesNotMatch(staff, /getNewsletterAdminRecipients/);
  assert.doesNotMatch(staff, /INTERNAL_TEST_RECIPIENTS/);
  assert.doesNotMatch(staff, /newsletter\/subscribe/);
  assert.match(staff, /dn@soilseedandwater\.com/);
  assert.match(api, /Never email the customer here/);
});

const classAnswers = {
  firstName: "Rodo",
  email: "rodo@example.com",
  source: "garden-class-2026-08",
  notes: "The fan helped.",
  saturday: 8,
  heat: 4,
  teaching: 9,
  comeAgain: "yes",
};

test("garden class survey requires 1-10 scores, not a yard visit writeup", () => {
  const missingScore = validateSurveyResponse({
    firstName: "Rodo",
    email: "rodo@example.com",
    source: "garden-class-2026-08",
    notes: "The fan helped.",
  });
  assert.equal(missingScore.ok, false);

  const oldHeatChip = validateSurveyResponse({
    firstName: "Rodo",
    email: "rodo@example.com",
    source: "garden-class-2026-08",
    saturday: 8,
    heatCall: "yes",
    teaching: 9,
    comeAgain: "yes",
  });
  assert.equal(oldHeatChip.ok, false);
  assert.equal(oldHeatChip.error, "Please tell us how the heat felt.");
  assert.doesNotMatch(oldHeatChip.error || "", /8am/);

  const oldSaturdayChip = validateSurveyResponse({
    firstName: "Rodo",
    email: "rodo@example.com",
    source: "garden-class-2026-08",
    saturdayFeel: "great",
    heat: 4,
    teaching: 9,
    comeAgain: "yes",
  });
  assert.equal(oldSaturdayChip.ok, false);

  const oldTeachingChip = validateSurveyResponse({
    firstName: "Rodo",
    email: "rodo@example.com",
    source: "garden-class-2026-08",
    saturday: 8,
    heat: 4,
    teaching: "loved-it",
    comeAgain: "yes",
  });
  assert.equal(oldTeachingChip.ok, false);

  const ok = validateSurveyResponse(classAnswers);
  assert.equal(ok.ok, true);
  assert.equal(ok.bot, false);
  assert.equal(ok.response.source, "garden-class-2026-08");
  assert.equal(ok.response.surveyKind, SURVEY_KIND_GARDEN_CLASS);
  assert.equal(ok.response.eventKey, GARDEN_CLASS_EVENT_KEY);
  assert.equal(ok.response.saturday, 8);
  assert.equal(ok.response.heat, 4);
  assert.equal(ok.response.teaching, 9);
  assert.equal(ok.response.wouldComeBack, "yes");
  assert.equal(ok.response.notes, "The fan helped.");
  assert.equal(ok.response.visitFeedback, "The fan helped.");
  assert.deepEqual(ok.response.scores, {
    saturday: 8,
    heat: 4,
    teaching: 9,
    comeAgain: "yes",
  });
});

test("garden class survey comment can be blank", () => {
  const ok = validateSurveyResponse({ ...classAnswers, notes: "", visitFeedback: "" });
  assert.equal(ok.ok, true);
  assert.equal(ok.response.visitFeedback, "");
  assert.equal(ok.response.notes, "");
});

test("garden class survey writes to sp_survey_responses with no coupon", async () => {
  const db = createSurveyDb();
  const validation = validateSurveyResponse(classAnswers);
  let couponCalls = 0;
  const saved = await saveSurveyResponse({
    db,
    response: validation.response,
    createCouponCode() {
      couponCalls += 1;
      return "SSW30-SHOULDNT";
    },
  });
  assert.equal(couponCalls, 0);
  assert.equal(saved.coupon, null);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].source, "garden-class-2026-08");
  assert.equal(db.rows[0].survey_kind, SURVEY_KIND_GARDEN_CLASS);
  assert.equal(db.rows[0].event_key, GARDEN_CLASS_EVENT_KEY);
  assert.equal(db.rows[0].visit_feedback, "The fan helped.");
  assert.equal(db.rows[0].notes, "The fan helped.");
  assert.equal(db.rows[0].what_felt_easy, "8");
  assert.equal(db.rows[0].what_felt_confusing, "4");
  assert.equal(db.rows[0].what_to_add_next, "9");
  assert.equal(db.rows[0].would_come_back, "yes");
  assert.equal(db.rows[0].coupon_code, null);
  assert.deepEqual(db.rows[0].scores, {
    saturday: 8,
    heat: 4,
    teaching: 9,
    comeAgain: "yes",
  });
});

test("garden class survey page is not the yard apology coupon form", async () => {
  const page = await readFile(new URL("../client/src/pages/GardenClassSurvey.tsx", import.meta.url), "utf8");
  const slider = await readFile(new URL("../client/src/components/survey/ScoreSlider.tsx", import.meta.url), "utf8");
  const entry = await readFile(new URL("../client/src/pages/SurveyEntry.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const sources = await readFile(new URL("../shared/surveySources.js", import.meta.url), "utf8");
  const contact = await readFile(new URL("../client/src/config/contact.ts", import.meta.url), "utf8");
  const ig = await readFile(new URL("../client/src/pages/InstagramLinks.tsx", import.meta.url), "utf8");
  const yard = await readFile(new URL("../client/src/pages/ClientSurvey.tsx", import.meta.url), "utf8");
  assert.match(page, /How did Saturday feel\?/);
  assert.match(page, /Was it too hot\?/);
  assert.match(page, /How was the teaching\?/);
  assert.match(page, /Would you come to another class\?/);
  assert.match(page, /Anything else you want us to hear\?/);
  assert.match(slider, /type="range"/);
  assert.match(page, /ScoreSlider/);
  assert.match(page, /const \[saturday, setSaturday\] = useState\(5\)/);
  assert.match(page, /const \[heat, setHeat\] = useState\(5\)/);
  assert.match(page, /const \[teaching, setTeaching\] = useState\(5\)/);
  assert.match(page, /window\.location\.search/);
  assert.match(page, /readGardenClassSurveyPrefill/);
  assert.match(sources, /first_name/);
  assert.match(sources, /firstName/);
  assert.match(sources, /last_name/);
  assert.match(sources, /params\.get\('name'\)|pick\('name'\)/);
  assert.match(sources, /pick\('email'\)/);
  assert.match(page, /GARDEN_CLASS_SURVEY_SOURCE/);
  assert.match(page, /GARDEN_CLASS_EVENT_KEY/);
  assert.match(sources, /garden-class-2026-08/);
  assert.match(page, /PHOENIX_YARD_ADDRESS/);
  assert.match(page, /CUSTOMER_SUPPORT_PHONE_DISPLAY/);
  assert.match(page, /Tue-Sat, 8 AM-4 PM, closed 1-2 PM/);
  assert.match(contact, /1634 N 19th Ave/);
  assert.match(contact, /\(623\) 263-3386/);
  assert.ok(page.indexOf("class-survey-first-name") < page.indexOf("class-survey-saturday"));
  assert.ok(page.indexOf("class-survey-email") < page.indexOf("class-survey-saturday"));
  assert.doesNotMatch(page, /moving to 8am/i);
  assert.doesNotMatch(page, /moving the class/i);
  assert.doesNotMatch(page, /right call/);
  assert.doesNotMatch(page, /readOnly|disabled=\{true\}/);
  assert.doesNotMatch(page, /30%/);
  assert.doesNotMatch(page, /SSW30/);
  assert.doesNotMatch(page, /Finish this and we'll give you/);
  assert.doesNotMatch(page, /2 minutes|takes a minute|under a minute/i);
  assert.doesNotMatch(page, /We owe you an apology/);
  assert.doesNotMatch(page, /How did the yard feel\?/);
  assert.doesNotMatch(page, /\u2014/);
  assert.match(entry, /isGardenClassSurveySource/);
  assert.match(app, /path="\/survey\/garden-class"/);
  assert.match(app, /path="\/survey"/);
  assert.match(app, /path="\/admin\/surveys"/);
  assert.match(ig, /Tell me about the next class/);
  assert.doesNotMatch(ig, /Register for The Garden Reset/);
  assert.doesNotMatch(ig, /Aug 22/);
  assert.match(yard, /A fast survey for honest feedback/);
  assert.match(yard, /continueFromYou\}>\s*Start/);
  assert.match(yard, /free 50 pound dairy compost/);
  assert.doesNotMatch(yard, /30% off/);
  assert.doesNotMatch(yard, /SSW30/);
  assert.match(yard, /Finding the yard \/ entrance/);
  assert.match(yard, /readSurveyPrefill/);
  assert.match(yard, /readYardPrefill/);
  assert.match(yard, /identityPrefill\.firstName/);
  assert.match(yard, /identityPrefill\.email/);
  assert.match(yard, /findingUs/);
  assert.match(yard, /workedWell/);
  assert.match(yard, /improveMost/);
  assert.match(yard, /survey-notes/);
  assert.equal((yard.match(/<Textarea/g) || []).length, 1);
  assert.doesNotMatch(yard, /We owe you an apology/);
  assert.doesNotMatch(yard, /2 minutes/);
  assert.doesNotMatch(yard, /about one minute/i);
  assert.doesNotMatch(yard, /under a minute/i);
  assert.doesNotMatch(yard, /minute/);
  assert.doesNotMatch(yard, /What felt easy/);
  assert.doesNotMatch(yard, /What felt confusing/);
  assert.doesNotMatch(yard, /Would you send a friend/);
  assert.doesNotMatch(yard, /What should we add next/);
  assert.doesNotMatch(yard, /survey-q1/);
  assert.doesNotMatch(yard, /const \[firstName, setFirstName\] = useState\(""\)/);
  assert.match(yard, /const \[experience, setExperience\] = useState<number \| null>\(null\)/);
  assert.match(yard, /const \[findingUs, setFindingUs\] = useState<number \| null>\(null\)/);
  assert.match(yard, /const \[comeBack, setComeBack\] = useState<number \| null>\(null\)/);
  assert.match(yard, /scoreScale: 5/);
  assert.match(yard, /90 days to redeem/);
});

test("yard survey 1-5 scale is stored as out of 5 and rejects a 10", () => {
  const saved = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    experienceScore: 5,
    findingUs: 4,
    comeBack: 5,
    scoreScale: 5,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.response.visitFeedback, "Experience 5/5. Finding us 4/5. Come back 5/5.");
  assert.equal(saved.response.scores.scale, 5);

  const tooHigh = validateSurveyResponse({
    firstName: "Alex",
    email: "alex@example.com",
    experienceScore: 10,
    findingUs: 8,
    comeBack: 9,
    scoreScale: 5,
  });
  assert.equal(tooHigh.ok, false);
});

test("garden class named scores write saturday, heat, teaching, comeAgain and no coupon", async () => {
  const db = createSurveyDb();
  const validation = validateSurveyResponse({
    firstName: "Rodo",
    email: "rodo@example.com",
    source: "garden-class-2026-08",
    notes: "The fan helped.",
    saturday: 8,
    heat: 4,
    teaching: 9,
    comeAgain: "yes",
    eventKey: GARDEN_CLASS_EVENT_KEY,
  });
  assert.equal(validation.ok, true);
  const saved = await saveSurveyResponse({
    db,
    response: validation.response,
    createCouponCode: () => "SSW30-SHOULDNT",
  });
  assert.equal(saved.coupon, null);
  assert.equal(db.rows[0].survey_kind, SURVEY_KIND_GARDEN_CLASS);
  assert.equal(db.rows[0].event_key, "fall-garden-workshop-2026-08-22");
  assert.equal(db.rows[0].notes, "The fan helped.");
  assert.equal(db.rows[0].coupon_code, null);
  assert.deepEqual(db.rows[0].scores, {
    saturday: 8,
    heat: 4,
    teaching: 9,
    comeAgain: "yes",
  });
});

test("garden class survey prefill reads first_name, name, and email without locking", () => {
  assert.deepEqual(
    readGardenClassSurveyPrefill(
      "?source=garden-class-2026-08&first_name=Haylee&email=haylee@example.com",
    ),
    { firstName: "Haylee", email: "haylee@example.com", lastName: "" },
  );
  assert.equal(readGardenClassSurveyPrefill("?firstName=Haylee&email=haylee@example.com").firstName, "Haylee");
  assert.equal(readGardenClassSurveyPrefill("?name=Haylee%20Smith&email=haylee@example.com").firstName, "Haylee");
  assert.equal(
    readGardenClassSurveyPrefill("?first_name=Haylee&last_name=Smith&email=haylee@example.com").lastName,
    "Smith",
  );
  assert.equal(readGardenClassSurveyPrefill("?name=Haylee&first_name=Rodo").firstName, "Rodo");
});

test("inbox lists all rows and can filter class-only", async () => {
  const db = createSurveyDb();
  await saveSurveyResponse({
    db,
    response: validateSurveyResponse(validAnswers).response,
    createCouponCode: () => "SSW30-PURCHASE",
  });
  await saveSurveyResponse({
    db,
    response: validateSurveyResponse(classAnswers).response,
  });

  const all = await listSurveyInbox(db, { kind: "all" });
  assert.equal(all.counts.all, 2);
  assert.equal(all.counts.purchase, 1);
  assert.equal(all.counts["garden-class"], 1);
  assert.equal(all.rows.length, 2);

  const classes = await listSurveyInbox(db, { kind: "garden-class" });
  assert.equal(classes.kind, "garden-class");
  assert.equal(classes.rows.length, 1);
  assert.equal(classes.rows[0].survey_kind, SURVEY_KIND_GARDEN_CLASS);
  assert.equal(classes.rows[0].notes, "The fan helped.");
});

test("live survey forms post to /api/survey/submit and prod aliases the 2026-08-28 404 paths", async () => {
  const yard = await readFile(new URL("../client/src/pages/ClientSurvey.tsx", import.meta.url), "utf8");
  const gardenClass = await readFile(new URL("../client/src/pages/GardenClassSurvey.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../api/index.js", import.meta.url), "utf8");
  const express = await readFile(new URL("../server/routes/index.ts", import.meta.url), "utf8");

  assert.match(yard, /fetch\("\/api\/survey\/submit"/);
  assert.match(gardenClass, /fetch\("\/api\/survey\/submit"/);
  assert.doesNotMatch(yard, /\/api\/public\/survey"/);
  assert.doesNotMatch(yard, /\/api\/surveys"/);
  assert.doesNotMatch(gardenClass, /\/api\/public\/survey"/);
  assert.doesNotMatch(gardenClass, /\/api\/surveys"/);

  assert.deepEqual([...SURVEY_SUBMIT_POST_PATHS], [
    "/api/survey",
    "/api/survey/submit",
    "/api/public/survey",
    "/api/surveys",
  ]);
  assert.equal(isSurveySubmitPostPath("/api/public/survey"), true);
  assert.equal(isSurveySubmitPostPath("/api/surveys"), true);
  assert.equal(isSurveySubmitPostPath("/api/survey/submit"), true);
  assert.equal(isSurveySubmitPostPath("/api/graphql"), false);

  assert.match(api, /isSurveySubmitPostPath\(path\) && req\.method === 'POST'/);
  assert.match(express, /app\.post\(SURVEY_SUBMIT_POST_PATHS, handleSurveySubmit\)/);
});

test("one landing table: class and purchase share sp_survey_responses", async () => {
  const survey = await readFile(new URL("../shared/surveyResponses.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260824_survey_kinds.sql", import.meta.url), "utf8");
  const api = await readFile(new URL("../api/index.js", import.meta.url), "utf8");
  assert.match(survey, /from\('sp_survey_responses'\)/);
  assert.doesNotMatch(survey, /sp_garden_class_survey/);
  assert.doesNotMatch(migration, /create table/i);
  assert.match(migration, /survey_kind/);
  assert.match(migration, /event_key/);
  assert.match(migration, /sp_survey_garden_class/);
  assert.match(api, /\/api\/admin\/surveys/);
});

test("yard coupon lookup uses limit(1) and experience_score CHECK is 1-10 in repo", async () => {
  const survey = await readFile(new URL("../shared/surveyResponses.js", import.meta.url), "utf8");
  const lookup = survey.slice(
    survey.indexOf("export async function findSurveyCouponByEmail"),
    survey.indexOf("export async function findSurveyCouponByCode"),
  );
  assert.match(lookup, /\.limit\(1\)/);
  assert.doesNotMatch(lookup, /maybeSingle/);
  const migration = await readFile(
    new URL("../supabase/migrations/20260828_survey_experience_score_1_to_10.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /drop constraint if exists sp_survey_responses_experience_score_check/);
  assert.match(
    migration,
    /experience_score is null or \(experience_score >= 1 and experience_score <= 10\)/,
  );
});

test("garden class validator no longer requires chip enums or the 8am heatCall error", async () => {
  const survey = await readFile(new URL("../shared/surveyResponses.js", import.meta.url), "utf8");
  assert.match(survey, /parseGardenClassScore/);
  assert.match(survey, /Please tell us how the heat felt\./);
  assert.doesNotMatch(survey, /8am was the right call/);
  assert.doesNotMatch(survey, /GARDEN_CLASS_SATURDAY_FEEL/);
  assert.doesNotMatch(survey, /GARDEN_CLASS_HEAT_CALL/);
  assert.doesNotMatch(survey, /GARDEN_CLASS_TEACHING/);
  assert.doesNotMatch(survey, /loved-it/);
  assert.doesNotMatch(survey, /new Set\(\['great', 'okay', 'rough'\]\)/);
  assert.doesNotMatch(survey, /new Set\(\['yes', 'not-sure', 'no'\]\)/);
});

function createFakeResend() {
  const sent = [];
  return {
    sent,
    emails: {
      send: async (payload) => {
        sent.push(payload);
        return { data: { id: `re_${sent.length}` }, error: null };
      },
    },
  };
}

const staffRecipients = [
  { name: "Rodolfo Alvarez", email: "ralvarez@soilseedandwater.com" },
  { name: "Kerry Cooper", email: "kcooper@soilseedandwater.com" },
];

test("yard survey submit pings staff, never the customer, never Nowell", async () => {
  const db = createSurveyDb();
  const resend = createFakeResend();
  const result = await processSurveySubmission({
    db,
    body: validAnswers,
    userAgent: "SurveyTest/1.0",
    resend,
    getRecipients: () => [
      ...staffRecipients,
      { name: "Jordan Customer", email: "jordan@example.com" },
      { name: "Dan Nowell", email: "dn@soilseedandwater.com" },
    ],
  });

  assert.equal(result.status, 201);
  assert.equal(result.json.success, true);
  assert.equal(db.rows.length, 1);
  assert.equal(resend.sent.length, 2);
  assert.deepEqual(resend.sent.map((payload) => payload.to), [
    "ralvarez@soilseedandwater.com",
    "kcooper@soilseedandwater.com",
  ]);
  for (const payload of resend.sent) {
    assert.equal(payload.subject, STAFF_YARD_SURVEY_SUBJECT);
    assert.doesNotMatch(payload.subject, /Jordan/);
    assert.equal(payload.headers["In-Reply-To"], STAFF_YARD_SURVEY_THREAD_ID);
    assert.notEqual(payload.headers["In-Reply-To"], STAFF_NEWSLETTER_THREAD_ID);
    assert.notEqual(payload.headers["In-Reply-To"], STAFF_GARDEN_CLASS_THREAD_ID);
    assert.notEqual(payload.subject, STAFF_SIGNUP_SUBJECT);
    assert.notEqual(payload.subject, STAFF_GARDEN_CLASS_SUBJECT);
    assert.equal(payload.from, "Soil Seed & Water <info@soilseedandwater.com>");
    assert.equal(payload.replyTo, "ralvarez@soilseedandwater.com");
    assert.match(payload.html, /Jordan/);
    assert.match(payload.html, /jordan@example.com/);
    assert.match(payload.html, /\/admin\/surveys/);
    assert.doesNotMatch(payload.html, /SSW30-/);
    assert.notEqual(payload.to, "jordan@example.com");
    assert.notEqual(payload.to, "dn@soilseedandwater.com");
  }
  assert.ok(db.rows[0].follow_up_alerted_at);
});

test("class survey submit pings staff with New class survey", async () => {
  const db = createSurveyDb();
  const resend = createFakeResend();
  const result = await processSurveySubmission({
    db,
    body: classAnswers,
    resend,
    getRecipients: () => staffRecipients,
  });
  assert.equal(result.status, 201);
  assert.equal(result.json.coupon, null);
  assert.equal(resend.sent.length, 2);
  assert.equal(resend.sent[0].subject, STAFF_CLASS_SURVEY_SUBJECT);
  assert.equal(resend.sent[0].headers["In-Reply-To"], STAFF_CLASS_SURVEY_THREAD_ID);
  assert.notEqual(resend.sent[0].subject, STAFF_YARD_SURVEY_SUBJECT);
  assert.match(resend.sent[0].html, /garden-class/);
  assert.notEqual(resend.sent[0].to, "rodo@example.com");
});

test("honeypot survey submit sends no staff mail and writes nothing", async () => {
  const db = createSurveyDb();
  const resend = createFakeResend();
  const result = await processSurveySubmission({
    db,
    body: { ...validAnswers, website: "https://spam.example" },
    resend,
    getRecipients: () => staffRecipients,
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.success, true);
  assert.equal(db.rows.length, 0);
  assert.equal(resend.sent.length, 0);
});

test("insert failure sends no staff mail", async () => {
  const resend = createFakeResend();
  const db = {
    from(table) {
      if (table === "sp_customers") {
        return {
          select() { return this; },
          ilike() { return this; },
          limit: async () => ({ data: [], error: { message: "no match" } }),
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        not() { return this; },
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        insert() { return this; },
        single: async () => ({ data: null, error: { message: "insert failed" } }),
      };
    },
  };
  await assert.rejects(
    () => processSurveySubmission({
      db,
      body: validAnswers,
      resend,
      getRecipients: () => staffRecipients,
    }),
    (err) => String(err?.message || err).includes("insert failed"),
  );
  assert.equal(resend.sent.length, 0);
});

test("staff mail failure still returns 201 and leaves follow_up_alerted_at null", async () => {
  const db = createSurveyDb();
  const result = await processSurveySubmission({
    db,
    body: validAnswers,
    resend: {
      emails: {
        send: async () => ({ data: null, error: { message: "resend down" } }),
      },
    },
    getRecipients: () => staffRecipients,
  });
  assert.equal(result.status, 201);
  assert.equal(db.rows[0].follow_up_alerted_at, undefined);
});

test("survey alert recipients reuse ADMIN_TEAM and drop Nowell and Nancy", () => {
  const overridden = getSurveyAlertRecipients({
    envRecipients: "ralvarez@soilseedandwater.com, dn@soilseedandwater.com, nancy@example.com, kcooper@soilseedandwater.com, johnathan@example.com, luis@example.com, simon@example.com, jesus@example.com",
  });
  assert.deepEqual(overridden.map((person) => person.email), [
    "ralvarez@soilseedandwater.com",
    "kcooper@soilseedandwater.com",
  ]);
  const fromTeam = getSurveyAlertRecipients({ envRecipients: "" });
  assert.deepEqual(fromTeam.map((person) => person.email), [
    "ralvarez@soilseedandwater.com",
    "kcooper@soilseedandwater.com",
    "sabrina@soilseedandwater.com",
    "kash@soilseedandwater.com",
    "gperez@soilseedandwater.com",
    "alejandrapatriciaalvarez@gmail.com",
  ]);
  assert.equal(fromTeam.length, 6);
  assert.equal(fromTeam.some((person) => /nowell|nancy|johnathan|luis|\bsimon\b|jesus|dn@/i.test(`${person.name} ${person.email}`)), false);
});
