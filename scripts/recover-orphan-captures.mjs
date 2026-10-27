#!/usr/bin/env node
/**
 * Find content-review captures that were uploaded but never finalized, and
 * finalize them. Idempotent: a second run does not create another asset.
 *
 * Do not point this at production. The production project ref is refused
 * unless RECOVER_ORPHAN_CAPTURES_ALLOW_PRODUCTION=1 is set on purpose.
 *
 *   node scripts/recover-orphan-captures.mjs --dry-run
 *
 * This file does not open a database connection by itself. Build the orphan
 * list with selectOrphanCaptures from storage and grant lists, then pass a
 * local adapter. Keep the guard in place before wiring credentials.
 */
import { assertRecoveryTargetAllowed, recoverOrphanCaptures } from "../server/contentCapture/recover.js";

export async function runRecoveryCli({
  env = process.env,
  argv = process.argv,
  orphans = null,
  deps = null,
  recover = recoverOrphanCaptures,
  log = console,
} = {}) {
  const supabaseUrl = env.SUPABASE_URL || "";
  assertRecoveryTargetAllowed(supabaseUrl, env);
  if (!argv.includes("--apply")) {
    log.log("Dry run only. No production data was read or changed. Pass --apply with a non-production project to finalize orphans.");
    return { dryRun: true, summary: null };
  }
  if (!orphans || !deps) {
    throw new Error("Applying recovery needs a local store adapter. Refusing to query a live project from this script.");
  }
  return { dryRun: false, summary: await recover(orphans, deps) };
}

const executedDirectly = process.argv[1] && process.argv[1].endsWith("recover-orphan-captures.mjs");
if (executedDirectly) {
  runRecoveryCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
