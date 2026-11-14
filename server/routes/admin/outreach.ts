import { Router } from "express";
import { handleOutreachRequest } from "../../../shared/outreachManager.js";

const router = Router();

router.use(async (req, res) => {
  const url = new URL(req.originalUrl, `http://${req.headers.host || "localhost"}`);
  await handleOutreachRequest(req, res, { path: url.pathname, url });
});

export default router;
