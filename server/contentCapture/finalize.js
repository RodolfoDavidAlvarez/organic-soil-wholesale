import { sha256Hex } from "./derivatives.js";

export class CaptureFinalizeError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = "CaptureFinalizeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function asFinalizeError(error) {
  if (error instanceof CaptureFinalizeError) return error;
  const code = error?.code === "image_decode_failed" ? "image_decode_failed" : "finalize_failed";
  const statusCode = code === "image_decode_failed" ? 422 : 500;
  return new CaptureFinalizeError(code, error?.message || "Capture finalize failed.", statusCode);
}

function versionIdentity(version) {
  return {
    duplicate: true,
    status: version.status,
    assetId: version.assetId,
    versionId: version.versionId,
    checksum: version.checksum,
    storagePath: version.storagePath,
  };
}

export async function finalizeCapture(input, deps) {
  const { store, buildDerivatives, logger = console } = deps;
  const grant = input.grant;
  if (!grant?.id || !grant.storagePath || !grant.organizationId) {
    throw new CaptureFinalizeError("unknown_upload", "The upload grant is missing.", 404);
  }

  const existingPath = await store.findByPath(grant.organizationId, grant.bucket, grant.storagePath);
  if (existingPath?.checksumStatus === "verified") {
    return versionIdentity(existingPath);
  }
  if (grant.idempotencyKey) {
    const existingKey = await store.findByIdempotency(grant.organizationId, grant.idempotencyKey);
    if (existingKey?.checksumStatus === "verified") {
      await store.consumeGrant(grant.id);
      return versionIdentity(existingKey);
    }
  }

  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes || []);
  const checksum = sha256Hex(bytes);
  const prior = await store.findByChecksum(grant.organizationId, checksum);
  if (prior?.checksumStatus === "verified") {
    await store.consumeGrant(grant.id);
    return versionIdentity(prior);
  }

  let derivatives;
  try {
    derivatives = await buildDerivatives({
      buffer: bytes,
      contentType: grant.contentType,
      filename: input.filename || grant.filename || "",
    });
  } catch (error) {
    const failure = asFinalizeError(error);
    logger.error({
      event: "capture_finalize_failed",
      code: failure.code,
      message: failure.message,
      checksum,
      organizationId: grant.organizationId,
      userId: grant.userId ?? null,
      storagePath: grant.storagePath,
      contentType: grant.contentType || null,
    });
    await store.saveFailed({
      grant,
      filename: input.filename || grant.filename || "photo",
      idempotencyKey: grant.idempotencyKey || null,
      message: failure.message,
      code: failure.code,
      checksum,
      reuseVersionId: prior?.versionId || null,
    });
    throw failure;
  }

  const existingChecksum = await store.findVerifiedByChecksum(grant.organizationId, derivatives.checksum);
  if (existingChecksum) {
    await store.consumeGrant(grant.id);
    return versionIdentity(existingChecksum);
  }

  await store.putDerivative({
    path: derivatives.previewPath,
    buffer: derivatives.preview,
    contentType: "image/jpeg",
  });
  await store.putDerivative({
    path: derivatives.thumbnailPath,
    buffer: derivatives.thumbnail,
    contentType: "image/jpeg",
  });

  const saved = await store.saveReady({
    grant,
    filename: input.filename || grant.filename || "photo",
    idempotencyKey: grant.idempotencyKey || null,
    brand: input.brand || "soil_seed_and_water",
    derivatives,
    contentType: grant.contentType || (derivatives.heic ? "image/heic" : "image/jpeg"),
    byteSize: bytes.length,
    reuseVersionId: prior?.versionId || null,
  });
  await store.consumeGrant(grant.id);
  return {
    duplicate: false,
    status: "ready_for_review",
    assetId: saved.assetId,
    versionId: saved.versionId,
    checksum: derivatives.checksum,
    storagePath: saved.storagePath || grant.storagePath,
    previewPath: derivatives.previewPath,
    thumbnailPath: derivatives.thumbnailPath,
    width: derivatives.width,
    height: derivatives.height,
  };
}

export function finalizeErrorBody(error) {
  const failure = asFinalizeError(error);
  return {
    statusCode: failure.statusCode,
    body: {
      error: failure.code,
      status: "failed",
      message: failure.message,
    },
  };
}
