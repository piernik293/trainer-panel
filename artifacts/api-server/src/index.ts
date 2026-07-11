import app from "./app";
import { logger } from "./lib/logger";
import { maybeRunSeed } from "./seeds/volumeGuidelines";

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

async function startServer() {
  try {
    await maybeRunSeed();
    logger.info("Volume guidelines seed check complete");
  } catch (err) {
    logger.warn({ err }, "Seed check failed (non-fatal, will retry next restart)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

startServer();
