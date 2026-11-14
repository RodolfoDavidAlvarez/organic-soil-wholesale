import { handleOutreachRequest } from "../shared/outreachManager.js";
import { resolveOutreachTarget } from "../shared/outreachMetrics.js";

// Dedicated Vercel function for /api/admin/outreach/*.
// vercel.json rewrites those paths here before the /api catch-all, because
// the production domain was still running the catch-all without this route.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  const target = resolveOutreachTarget(req);
  await handleOutreachRequest(req, res, target);
}
