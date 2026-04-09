import { Router } from "express";
import { getSystemLogs, clearSystemLogs } from "../services/logs";

const router = Router();

router.get("/", async (req, res) => {
  const limit    = Math.min(Number(req.query.limit  ?? 100), 500);
  const offset   = Number(req.query.offset ?? 0);
  const category = req.query.category as string | undefined;
  const level    = req.query.level    as string | undefined;

  const result = await getSystemLogs({ limit, offset, category, level });
  res.json(result);
});

router.delete("/", async (_req, res) => {
  const { deleted } = await clearSystemLogs();
  res.json({ success: true, deleted, message: `تم حذف ${deleted} سجل` });
});

export default router;
