import app from "./app";
import { logger } from "./lib/logger";
import { initDb } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Global crash guards ─────────────────────────────────────────────────────
// Prevent the Node process from dying on unhandled promise rejections or
// uncaught exceptions — log them instead so the server keeps running 24/7.

process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason }, "Unhandled promise rejection — server kept alive");
});

process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "Uncaught exception — server kept alive");
});

// ─── Initialise DB tables then start HTTP server ─────────────────────────────

initDb()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "DB initialisation failed — server not started");
    process.exit(1);
  });
