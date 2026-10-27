import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { buildCaptureDerivatives, isHeicOrHeif } from "../server/contentCapture/derivatives.js";
import { finalizeCapture, finalizeErrorBody } from "../server/contentCapture/finalize.js";
import { buildCaptureFinalizeRpcArgs } from "../server/contentCapture/rpcPayload.js";
import { assertRecoveryTargetAllowed, recoverOrphanCaptures, selectOrphanCaptures } from "../server/contentCapture/recover.js";
import { runRecoveryCli } from "../scripts/recover-orphan-captures.mjs";

const sampleHeic = await readFile(new URL("./fixtures/sample.heic", import.meta.url));

function memoryStore() {
  const versions = [];
  const derivatives = [];
  const consumed = [];
  let seq = 1;
  const byPath = (org, bucket, path) =>
    versions.find((row) => row.organizationId === org && row.bucket === bucket && row.storagePath === path) || null;

  const reusable = (record) => {
    if (record.reuseVersionId) {
      return versions.find((row) => row.versionId === record.reuseVersionId) || null;
    }
    return byPath(record.grant.organizationId, record.grant.bucket, record.grant.storagePath);
  };

  return {
    versions,
    derivatives,
    consumed,
    async findByPath(org, bucket, path) {
      return byPath(org, bucket, path);
    },
    async findByIdempotency(org, key) {
      return versions.find((row) => row.organizationId === org && row.idempotencyKey === key) || null;
    },
    async findByChecksum(org, checksum) {
      const matches = versions.filter((row) => row.organizationId === org && row.checksum === checksum);
      return matches.find((row) => row.checksumStatus === "verified") || matches[0] || null;
    },
    async findVerifiedByChecksum(org, checksum) {
      return versions.find((row) => row.organizationId === org && row.checksum === checksum && row.checksumStatus === "verified") || null;
    },
    async putDerivative(item) {
      derivatives.push(item);
    },
    async consumeGrant(id) {
      consumed.push(id);
    },
    async saveReady(record) {
      const current = reusable(record);
      const row = {
        assetId: current?.assetId || `asset-${seq++}`,
        versionId: current?.versionId || `version-${seq++}`,
        organizationId: record.grant.organizationId,
        bucket: record.grant.bucket,
        storagePath: current?.storagePath || record.grant.storagePath,
        checksum: record.derivatives.checksum,
        checksumStatus: "verified",
        status: "ready_for_review",
        idempotencyKey: record.idempotencyKey,
        width: record.derivatives.width,
        height: record.derivatives.height,
        previewPath: record.derivatives.previewPath,
        thumbnailPath: record.derivatives.thumbnailPath,
        contentType: record.contentType,
        filename: record.filename,
        code: null,
        message: null,
      };
      if (current) Object.assign(current, row);
      else versions.push(row);
      return row;
    },
    async saveFailed(record) {
      const current = reusable(record);
      const row = {
        assetId: current?.assetId || `asset-${seq++}`,
        versionId: current?.versionId || `version-${seq++}`,
        organizationId: record.grant.organizationId,
        bucket: record.grant.bucket,
        storagePath: current?.storagePath || record.grant.storagePath,
        checksum: record.checksum || null,
        checksumStatus: "failed",
        status: "failed",
        idempotencyKey: record.idempotencyKey,
        width: null,
        height: null,
        previewPath: null,
        thumbnailPath: null,
        contentType: record.grant.contentType,
        filename: record.filename,
        code: record.code,
        message: record.message,
      };
      if (current) Object.assign(current, row);
      else versions.push(row);
      return row;
    },
  };
}

function grant(overrides = {}) {
  return {
    id: "grant-1",
    organizationId: 4,
    userId: 34,
    bucket: "content-review",
    storagePath: "captures/4/soil_seed_and_water/inbox/image/2026-10-26/photo.heic",
    contentType: "image/heic",
    idempotencyKey: "ssw-mobile-photo-1",
    ...overrides,
  };
}

test("sharp reads HEIC dimensions but cannot decode HEVC pixels", async () => {
  const metadata = await sharp(sampleHeic).metadata();
  assert.equal(metadata.format, "heif");
  assert.equal(metadata.compression, "hevc");
  assert.equal(metadata.width, 1440);
  await assert.rejects(
    () => sharp(sampleHeic).jpeg().toBuffer(),
    /not been built in/,
  );
});

test("HEIC and HEIF uploads become oriented JPEGs with GPS removed", async () => {
  assert.equal(isHeicOrHeif({ buffer: sampleHeic, contentType: "image/heic", filename: "IMG.HEIC" }), true);
  assert.equal(isHeicOrHeif({ buffer: Buffer.from("not-an-image"), contentType: "image/jpeg", filename: "a.jpg" }), false);
  assert.equal(isHeicOrHeif({ buffer: Buffer.from("heif-name-only"), contentType: "", filename: "phone.heif" }), true);

  const derivatives = await buildCaptureDerivatives({
    buffer: sampleHeic,
    contentType: "image/heic",
    filename: "phone.heic",
  });
  assert.equal(derivatives.heic, true);
  assert.equal(derivatives.width, 1440);
  assert.equal(derivatives.height, 960);
  assert.match(derivatives.previewPath, /^derivatives\/[0-9a-f]{2}\/[0-9a-f]{64}-preview\.jpg$/);
  assert.match(derivatives.thumbnailPath, /-thumb\.jpg$/);

  const preview = await sharp(derivatives.preview).metadata();
  const thumb = await sharp(derivatives.thumbnail).metadata();
  assert.equal(preview.format, "jpeg");
  assert.equal(preview.width, 1440);
  assert.equal(preview.exif, undefined);
  assert.equal(Math.max(thumb.width, thumb.height), 480);
  assert.equal(thumb.exif, undefined);

  const base = await sharp({
    create: { width: 30, height: 10, channels: 3, background: { r: 20, g: 40, b: 60 } },
  }).jpeg().toBuffer();
  const tagged = await sharp(base).withMetadata({ orientation: 6 }).withExif({
    IFD0: { ImageDescription: "secret yard" },
    IFD3: {
      GPSLatitudeRef: "N",
      GPSLatitude: "33/1 27/1 0/1",
      GPSLongitudeRef: "W",
      GPSLongitude: "112/1 4/1 0/1",
    },
  }).jpeg().toBuffer();
  const jpegDerivatives = await buildCaptureDerivatives({
    buffer: tagged,
    contentType: "image/jpeg",
    filename: "oriented.jpg",
  });
  assert.equal(jpegDerivatives.width, 10);
  assert.equal(jpegDerivatives.height, 30);
  const cleaned = await sharp(jpegDerivatives.preview).metadata();
  assert.equal(cleaned.exif, undefined);
  assert.equal(cleaned.orientation, undefined);

  const wide = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: { r: 9, g: 9, b: 9 } },
  }).jpeg().toBuffer();
  const wideDerivatives = await buildCaptureDerivatives({
    buffer: wide,
    contentType: "image/jpeg",
    filename: "wide.jpg",
  });
  assert.equal(Math.max(wideDerivatives.width, wideDerivatives.height), 2560);
  const wideThumb = await sharp(wideDerivatives.thumbnail).metadata();
  assert.equal(Math.max(wideThumb.width, wideThumb.height), 480);
});

test("a hung HEIC decoder fails loudly and records a failed version", async () => {
  const store = memoryStore();
  const logs = [];
  await assert.rejects(
    () => finalizeCapture(
      { grant: grant(), bytes: sampleHeic, filename: "phone.heic" },
      {
        store,
        logger: { error: (entry) => logs.push(entry) },
        buildDerivatives: () => buildCaptureDerivatives(
          { buffer: sampleHeic, contentType: "image/heic", filename: "phone.heic" },
          { timeoutMs: 30, convert: () => new Promise(() => {}) },
        ),
      },
    ),
    (error) => {
      assert.equal(error.code, "image_decode_failed");
      assert.equal(finalizeErrorBody(error).statusCode, 422);
      assert.equal(finalizeErrorBody(error).body.status, "failed");
      assert.match(finalizeErrorBody(error).body.message, /timed out/);
      return true;
    },
  );
  assert.equal(store.versions.length, 1);
  assert.equal(store.versions[0].status, "failed");
  assert.equal(store.versions[0].checksumStatus, "failed");
  assert.match(store.versions[0].checksum, /^[0-9a-f]{64}$/);
  assert.equal(store.derivatives.length, 0);
  assert.equal(store.consumed.length, 0);
  assert.equal(logs[0].event, "capture_finalize_failed");
  assert.equal(logs[0].storagePath, grant().storagePath);
  assert.equal(logs[0].code, "image_decode_failed");
});

test("finalize stores one asset and checksum retries do not duplicate it", async () => {
  const store = memoryStore();
  const deps = { store, buildDerivatives: buildCaptureDerivatives, logger: { error() {} } };
  const first = await finalizeCapture(
    { grant: grant(), bytes: sampleHeic, filename: "phone.heic", brand: "soil_seed_and_water" },
    deps,
  );
  assert.equal(first.duplicate, false);
  assert.equal(first.status, "ready_for_review");
  assert.equal(first.width, 1440);
  assert.equal(store.derivatives.length, 2);
  assert.deepEqual(store.consumed, ["grant-1"]);
  assert.equal(store.versions[0].contentType, "image/heic");
  assert.equal(store.versions[0].previewPath, first.previewPath);

  const samePath = await finalizeCapture(
    { grant: grant({ id: "grant-2" }), bytes: sampleHeic, filename: "phone.heic" },
    deps,
  );
  assert.equal(samePath.duplicate, true);
  assert.equal(samePath.assetId, first.assetId);
  assert.equal(store.versions.length, 1);
  assert.equal(store.derivatives.length, 2);

  const sameBytesNewPath = await finalizeCapture(
    {
      grant: grant({
        id: "grant-3",
        storagePath: "captures/4/soil_seed_and_water/inbox/image/2026-10-26/retry.heic",
        idempotencyKey: "ssw-mobile-photo-2",
      }),
      bytes: sampleHeic,
      filename: "phone-again.heic",
    },
    deps,
  );
  assert.equal(sameBytesNewPath.duplicate, true);
  assert.equal(sameBytesNewPath.assetId, first.assetId);
  assert.equal(store.versions.length, 1);
  assert.deepEqual(store.consumed, ["grant-1", "grant-3"]);
});

test("orphan recovery finalizes missing versions once, including a previously failed HEIC", async () => {
  const store = memoryStore();
  const logs = [];
  const deps = { store, buildDerivatives: buildCaptureDerivatives, logger: { error: (entry) => logs.push(entry) } };
  const failedGrant = grant({ id: "grant-fail", storagePath: "captures/4/soil_seed_and_water/inbox/image/2026-10-24/stuck.heic" });
  await assert.rejects(() => finalizeCapture(
    { grant: failedGrant, bytes: sampleHeic, filename: "stuck.heic" },
    {
      ...deps,
      buildDerivatives: () => Promise.reject(Object.assign(new Error("decoder unavailable"), { code: "image_decode_failed" })),
    },
  ));
  assert.equal(store.versions[0].status, "failed");

  const orphans = [
    { grant: failedGrant, bytes: sampleHeic, filename: "stuck.heic" },
    {
      grant: grant({ id: "grant-jpeg", contentType: "image/jpeg", storagePath: "captures/4/soil_seed_and_water/inbox/image/2026-10-22/ok.jpg", idempotencyKey: "jpeg-1" }),
      bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer(),
      filename: "ok.jpg",
    },
  ];
  const first = await recoverOrphanCaptures(orphans, deps);
  assert.equal(first.finalized.length, 2);
  assert.equal(first.failed.length, 0);
  assert.equal(store.versions.filter((row) => row.status === "ready_for_review").length, 2);
  assert.equal(logs.length, 1);

  const second = await recoverOrphanCaptures(orphans, deps);
  assert.equal(second.finalized.length, 0);
  assert.equal(second.duplicates.length, 2);
  assert.equal(store.versions.length, 2);
});

test("recovery refuses the production project and does not apply without a local adapter", async () => {
  assert.throws(
    () => assertRecoveryTargetAllowed("https://govktyrtmwzbzqkmzmrf.supabase.co"),
    /production project govktyrtmwzbzqkmzmrf/,
  );
  assert.doesNotThrow(() => assertRecoveryTargetAllowed("http://127.0.0.1:54321"));
  assert.doesNotThrow(() => assertRecoveryTargetAllowed(
    "https://govktyrtmwzbzqkmzmrf.supabase.co",
    { RECOVER_ORPHAN_CAPTURES_ALLOW_PRODUCTION: "1" },
  ));

  await assert.rejects(
    () => runRecoveryCli({
      env: { SUPABASE_URL: "https://govktyrtmwzbzqkmzmrf.supabase.co" },
      argv: ["node", "recover-orphan-captures.mjs"],
      log: { log() {} },
    }),
    /production project/,
  );
  const dry = await runRecoveryCli({
    env: { SUPABASE_URL: "http://127.0.0.1:54321" },
    argv: ["node", "recover-orphan-captures.mjs"],
    log: { log() {} },
  });
  assert.equal(dry.dryRun, true);

  await assert.rejects(
    () => runRecoveryCli({
      env: { SUPABASE_URL: "http://127.0.0.1:54321" },
      argv: ["node", "recover-orphan-captures.mjs", "--apply"],
      log: { log() {} },
    }),
    /local store adapter/,
  );
});

test("the same HEIC failing on two paths stays one failed asset, then finalizes once", async () => {
  const store = memoryStore();
  let fail = true;
  const deps = {
    store,
    logger: { error() {} },
    buildDerivatives(input) {
      if (fail) return Promise.reject(Object.assign(new Error("decoder unavailable"), { code: "image_decode_failed" }));
      return buildCaptureDerivatives(input);
    },
  };
  const secondPath = "captures/4/soil_seed_and_water/inbox/image/2026-10-24/retry.heic";
  await assert.rejects(() => finalizeCapture(
    { grant: grant(), bytes: sampleHeic, filename: "phone.heic" },
    deps,
  ));
  await assert.rejects(() => finalizeCapture(
    { grant: grant({ id: "grant-b", storagePath: secondPath, idempotencyKey: "ssw-mobile-photo-b" }), bytes: sampleHeic, filename: "retry.heic" },
    deps,
  ));
  assert.equal(store.versions.length, 1);
  assert.equal(store.versions[0].status, "failed");
  assert.equal(store.versions[0].storagePath, grant().storagePath);
  assert.equal(store.consumed.length, 0);

  fail = false;
  const recovered = await finalizeCapture(
    { grant: grant({ id: "grant-c", storagePath: secondPath, idempotencyKey: "ssw-mobile-photo-c" }), bytes: sampleHeic, filename: "retry.heic" },
    deps,
  );
  assert.equal(recovered.duplicate, false);
  assert.equal(recovered.assetId, store.versions[0].assetId);
  assert.equal(store.versions.length, 1);
  assert.equal(store.versions[0].status, "ready_for_review");
  assert.equal(store.versions[0].storagePath, grant().storagePath);
  assert.equal(store.derivatives.length, 2);
  assert.deepEqual(store.consumed, ["grant-c"]);
});

test("orphan selection keeps uploaded objects that have no verified version", () => {
  const openGrant = {
    id: "g-open",
    organization_id: 4,
    user_id: 34,
    storage_bucket: "content-review",
    storage_path: "captures/4/soil_seed_and_water/inbox/image/2026-10-26/a.heic",
    content_type: "image/heic",
    consumed_at: null,
  };
  const consumedGrant = { ...openGrant, id: "g-done", storage_path: "captures/4/done.jpg", consumed_at: "2026-10-26T00:00:00Z" };
  const objects = [
    { name: openGrant.storage_path },
    { name: consumedGrant.storage_path },
    { name: "captures/4/no-grant.jpg" },
    { name: "captures/4/already.jpg" },
  ];
  const versions = [{ storage_path: "captures/4/already.jpg", checksum_status: "verified" }];
  const orphans = selectOrphanCaptures({
    grants: [openGrant, consumedGrant],
    objects,
    versions,
  });
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].grant.id, "g-open");
  assert.equal(orphans[0].grant.organizationId, 4);
  assert.equal(orphans[0].grant.bucket, "content-review");
  assert.deepEqual(selectOrphanCaptures({ grants: [openGrant], objects, versions: [
    ...versions,
    { storage_path: openGrant.storage_path, checksum_status: "verified" },
  ] }), []);
});

test("successful finalize payload matches the capture insert and is not used for failures", () => {
  const checksum = "ab".repeat(32);
  const args = buildCaptureFinalizeRpcArgs({
    projectId: "b406f5bd-2033-4a24-bf12-0aa96d5c48d4",
    assetId: "11111111-1111-4111-8111-111111111111",
    versionId: "22222222-2222-4222-8222-222222222222",
    reviewId: "33333333-3333-4333-8333-333333333333",
    filename: "phone.heic",
    contentType: "image/heic",
    byteSize: sampleHeic.length,
    grant: grant(),
    derivatives: {
      heic: true,
      checksum,
      width: 1440,
      height: 960,
      previewPath: `derivatives/ab/${checksum}-preview.jpg`,
      thumbnailPath: `derivatives/ab/${checksum}-thumb.jpg`,
    },
  }, { now: () => "2026-10-26T21:49:00.000Z" });

  assert.equal(args.p_project, null);
  assert.equal(args.p_asset.asset_type, "image_asset");
  assert.equal(args.p_asset.purpose, "Field capture");
  assert.equal(args.p_asset.status, "ready_for_review");
  assert.equal(args.p_asset.asset_key, "capture-11111111");
  assert.equal(args.p_version.media_type, "image/heic");
  assert.equal(args.p_version.checksum_status, "verified");
  assert.equal(args.p_version.checksum_sha256, checksum);
  assert.equal(args.p_version.created_by, 34);
  assert.equal(args.p_version.storage_path, grant().storagePath);
  assert.equal(args.p_version.technical_metadata.original_preserved, true);
  assert.equal(args.p_version.technical_metadata.preview_path, args.p_version.thumbnail_path.replace("-thumb.jpg", "-preview.jpg"));
  assert.equal(args.p_version.provenance.idempotency_key, "ssw-mobile-photo-1");
  assert.equal(args.p_version.provenance.byte_size, sampleHeic.length);
  assert.equal(args.p_version.provenance.classification, "photo");
  assert.equal("exif" in args.p_version.technical_metadata, false);
  assert.equal(args.p_review.status, "pending");
  assert.equal(args.p_review.capturer_user_id, 34);
  assert.throws(() => buildCaptureFinalizeRpcArgs({ grant: grant(), derivatives: {} }), /projectId is required/);
});
