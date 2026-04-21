import { Router } from "express";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppQr,
  getWhatsAppStatus,
  clearWhatsAppQr,
  getSavedSession,
  forceWipeSession,
} from "../services/whatsapp";

const router = Router();

router.get("/status", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  const status = getWhatsAppStatus();
  // Wrap DB call so a slow/failed DB doesn't 500/timeout the status endpoint —
  // the dashboard relies on this poll every 3s and must always answer fast.
  let saved = { phone: null as string | null, name: null as string | null, hasBackup: false };
  try {
    const result = await Promise.race([
      getSavedSession(),
      new Promise<typeof saved>((_, reject) => setTimeout(() => reject(new Error("db timeout")), 4000)),
    ]);
    saved = result as typeof saved;
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "getSavedSession failed — returning status without saved session info");
  }
  res.json({
    ...status,
    savedPhone: saved.phone,
    savedName: saved.name,
    hasSavedSession: saved.hasBackup,
  });
});

router.post("/force-wipe", async (_req, res) => {
  await forceWipeSession();
  // Kick off a fresh connect so QR / pairing UI can appear immediately
  connectWhatsApp().catch(() => {});
  res.json({ success: true, message: "تم مسح الجلسة المحفوظة بالكامل — يمكنك الآن الربط برقم جديد" });
});

router.get("/qr", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json(getWhatsAppQr());
});

router.post("/disconnect", async (req, res) => {
  await disconnectWhatsApp();
  res.json({ success: true, message: "Disconnected" });
});

router.post("/connect", async (req, res) => {
  connectWhatsApp().catch((err) => req.log.error({ err }, "WhatsApp connect error"));
  res.json({ success: true, message: "Connecting..." });
});

router.post("/request-pairing-code", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    return res.status(400).json({ success: false, message: "رقم الهاتف مطلوب" });
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 7) {
    return res.status(400).json({ success: false, message: "رقم الهاتف غير صالح" });
  }
  // Start phone pairing asynchronously — the dashboard polls /status every 3s
  // to pick up pairingCode once it's generated
  connectWhatsApp(cleanPhone).catch((err) =>
    req.log.error({ err }, "Phone pairing error")
  );
  res.json({ success: true, pairingCode: null, message: "جارٍ توليد الكود..." });
});

router.post("/clear-qr", async (req, res) => {
  await clearWhatsAppQr();
  res.json({ success: true, message: "تم مسح الكود وإعادة الاتصال" });
});

export default router;

export { connectWhatsApp };
