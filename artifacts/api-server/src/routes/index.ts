import { Router, type IRouter } from "express";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import contactsRouter from "./contacts";
import messagesRouter from "./messages";
import settingsRouter from "./settings";
import statsRouter from "./stats";
import storageRouter from "./storage";
import { videoRouter } from "./video";
import logsRouter from "./logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/contacts", contactsRouter);
router.use("/messages", messagesRouter);
router.use("/settings", settingsRouter);
router.use("/stats", statsRouter);
router.use("/storage", storageRouter);
router.use("/video", videoRouter);
router.use("/logs", logsRouter);

export default router;
