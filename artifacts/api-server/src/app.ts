import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { connectWhatsApp } from "./services/whatsapp";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ─── Serve dashboard static files (production / Docker) ──────────────────────
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// ─── Global Express error handler ───────────────────────────────────────────
// Catches any error thrown (or passed via next(err)) inside route handlers.
// Prevents an unhandled Express error from crashing the process.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Auto-connect WhatsApp only outside development mode.
// Dev shares the same DB with production — auto-connecting in dev would kick the
// production session (reason=440) causing an infinite disconnect loop.
// In dev, connect manually from the dashboard if needed.
if (process.env.NODE_ENV !== "development") {
  connectWhatsApp().catch((err) => logger.error({ err }, "Initial WhatsApp connect failed"));
} else {
  logger.info("Development mode — WhatsApp auto-connect disabled to avoid conflicting with production session");
}

export default app;
