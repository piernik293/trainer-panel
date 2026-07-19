import app from "./app";
import { logger } from "./lib/logger";
import { maybeRunSeed } from "./seeds/volumeGuidelines";
import { applyVolumeTargetPatch } from "./seeds/volumeTargetPatch";
import { normalizeExerciseLocations } from "./seeds/normalizeLocations";
import { seedExerciseAdaptationFields } from "./seeds/exerciseAdaptation";
import { seedSubTargetBiases } from "./seeds/subTargetBiasSeed";

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

  try {
    await applyVolumeTargetPatch();
    logger.info("Volume target patch applied");
  } catch (err) {
    logger.warn({ err }, "Volume target patch failed (non-fatal, will retry next restart)");
  }

  try {
    await normalizeExerciseLocations();
  } catch (err) {
    logger.warn({ err }, "Exercise location normalization failed (non-fatal)");
  }

  try {
    await seedExerciseAdaptationFields();
  } catch (err) {
    logger.warn({ err }, "Exercise adaptation seed failed (non-fatal)");
  }

  try {
    await seedSubTargetBiases();
  } catch (err) {
    logger.warn({ err }, "Sub-target bias seed failed (non-fatal)");
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
