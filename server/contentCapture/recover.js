import { finalizeCapture } from "./finalize.js";

export const PRODUCTION_PROJECT_REFS = ["govktyrtmwzbzqkmzmrf"];

function text(value) {
  return value == null ? "" : String(value);
}

function asGrant(row) {
  if (row.storagePath && row.organizationId) return row;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    bucket: row.storage_bucket,
    storagePath: row.storage_path,
    contentType: row.content_type,
    idempotencyKey: row.idempotency_key || null,
    byteSize: row.byte_size,
    contentKind: row.content_kind || null,
    consumedAt: row.consumed_at || null,
  };
}

function versionPath(version) {
  return version.storagePath || version.storage_path;
}

function versionChecksumStatus(version) {
  return version.checksumStatus || version.checksum_status;
}

/**
 * Storage objects whose upload grant is still open and which have no verified
 * version. Lists are passed in so this can be tested without reading a project.
 */
export function selectOrphanCaptures({ grants = [], objects = [], versions = [] } = {}) {
  const verified = new Set(
    versions.filter((version) => versionChecksumStatus(version) === "verified").map(versionPath),
  );
  const grantsByPath = new Map();
  for (const grant of grants) {
    const normalized = asGrant(grant);
    if (!grantsByPath.has(normalized.storagePath)) grantsByPath.set(normalized.storagePath, normalized);
  }
  const orphans = [];
  for (const object of objects) {
    const storagePath = text(object.name || object.storagePath);
    if (!storagePath || verified.has(storagePath)) continue;
    const grant = grantsByPath.get(storagePath);
    if (!grant || grant.consumedAt || grant.consumed_at) continue;
    orphans.push({ storagePath, grant });
  }
  return orphans;
}

export function assertRecoveryTargetAllowed(supabaseUrl, env = process.env) {
  if (env.RECOVER_ORPHAN_CAPTURES_ALLOW_PRODUCTION === "1") return;
  const url = String(supabaseUrl || "");
  const hit = PRODUCTION_PROJECT_REFS.find((ref) => url.includes(ref));
  if (hit) {
    throw new Error(
      `Refusing to recover captures in production project ${hit}. This command is for a local or mock project.`,
    );
  }
}

/**
 * Finalize storage objects that have no verified version yet.
 * Running it again does not create a second asset for the same path or checksum.
 */
export async function recoverOrphanCaptures(orphans, deps) {
  const summary = { finalized: [], duplicates: [], failed: [] };
  for (const orphan of orphans) {
    const verified = await deps.store.findByPath(
      orphan.grant.organizationId,
      orphan.grant.bucket,
      orphan.grant.storagePath,
    );
    if (verified?.checksumStatus === "verified") {
      summary.duplicates.push({ storagePath: orphan.grant.storagePath, assetId: verified.assetId });
      continue;
    }
    try {
      const result = await finalizeCapture(
        { grant: orphan.grant, bytes: orphan.bytes, filename: orphan.filename, brand: orphan.brand },
        deps,
      );
      const bucket = result.duplicate ? summary.duplicates : summary.finalized;
      bucket.push({ storagePath: orphan.grant.storagePath, assetId: result.assetId, checksum: result.checksum });
    } catch (error) {
      summary.failed.push({
        storagePath: orphan.grant.storagePath,
        error: error.code || "finalize_failed",
        message: error.message,
      });
    }
  }
  return summary;
}
