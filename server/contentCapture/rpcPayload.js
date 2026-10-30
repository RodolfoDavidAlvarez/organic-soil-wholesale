import { randomUUID } from "node:crypto";

/**
 * Arguments for public.content_finalize_capture.
 *
 * That function only INSERTs a project, asset, version, and review, then
 * consumes the upload grant. Call it for the first successful finalize of a
 * checksum. Do not call it when decoding fails: a failed insert on the same
 * storage path would block this insert later, and it would consume the grant
 * before a retry could succeed. A duplicate checksum should consume the grant
 * with a separate update and must not call this function either.
 */
export function buildCaptureFinalizeRpcArgs(input, { now = () => new Date().toISOString() } = {}) {
  if (!input.projectId) {
    throw new Error("projectId is required. Reuse the field_capture project and pass p_project as null.");
  }
  const grant = input.grant;
  const derivatives = input.derivatives;
  const createdAt = now();
  const assetId = input.assetId || randomUUID();
  const versionId = input.versionId || randomUUID();
  const reviewId = input.reviewId || randomUUID();
  const filename = input.filename || "photo";
  const mediaType = input.contentType || (derivatives.heic ? "image/heic" : "image/jpeg");

  return {
    p_project: input.project || null,
    p_asset: {
      id: assetId,
      organization_id: grant.organizationId,
      project_id: input.projectId,
      asset_key: `capture-${assetId.replaceAll("-", "").slice(0, 8)}`,
      asset_type: "image_asset",
      title: filename,
      purpose: "Field capture",
      status: "ready_for_review",
      metadata: {},
      created_at: createdAt,
      updated_at: createdAt,
    },
    p_version: {
      id: versionId,
      organization_id: grant.organizationId,
      project_id: input.projectId,
      asset_id: assetId,
      version_number: 1,
      storage_bucket: grant.bucket,
      storage_path: grant.storagePath,
      thumbnail_path: derivatives.thumbnailPath,
      media_type: mediaType,
      checksum_sha256: derivatives.checksum,
      checksum_status: "verified",
      technical_metadata: {
        width: derivatives.width,
        height: derivatives.height,
        preview_path: derivatives.previewPath,
        original_preserved: true,
      },
      provenance: {
        brand: input.brand || "soil_seed_and_water",
        filename,
        byte_size: input.byteSize,
        media_kind: "image",
        content_tag: "photo",
        content_kind: "photo",
        classification: "photo",
        idempotency_key: grant.idempotencyKey || null,
        capturer_user_id: grant.userId,
      },
      rights: {},
      created_by: grant.userId,
      created_at: createdAt,
    },
    p_review: {
      id: reviewId,
      organization_id: grant.organizationId,
      project_id: input.projectId,
      asset_id: assetId,
      version_id: versionId,
      status: "pending",
      capturer_user_id: grant.userId,
      created_at: createdAt,
    },
  };
}
