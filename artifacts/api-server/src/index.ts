import app from "./app";
import { logger } from "./lib/logger";
import { maybeRunSeed } from "./seeds/volumeGuidelines";
import { applyVolumeTargetPatch } from "./seeds/volumeTargetPatch";
import { normalizeExerciseLocations } from "./seeds/normalizeLocations";
import { seedExerciseAdaptationFields } from "./seeds/exerciseAdaptation";
import { seedSubTargetBiases } from "./seeds/subTargetBiasSeed";
import { seedCatalogue } from "./seeds/catalogueSeed";
import { runSchemaMigrations } from "./seeds/schemaMigrations";
import { seedUnmappedMuscleVtm, checkUnmappedMuscles } from "./seeds/unmappedMuscleVtm";
import { runStartupMigration } from "./lib/migration";

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
  // Clerk auth schema migration — MUST succeed before the server accepts requests.
  // If this throws, the server exits (see catch below).
  await runStartupMigration();

  try {
    await runSchemaMigrations();
  } catch (err) {
    logger.warn({ err }, "Schema migrations failed (non-fatal, will retry next restart)");
  }

  try {
    await seedCatalogue();
    logger.info("Catalogue seed complete");
  } catch (err) {
    logger.warn({ err }, "Catalogue seed failed (non-fatal, will retry next restart)");
  }

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

  try {
    await seedUnmappedMuscleVtm();
    logger.info("Unmapped muscle VTM seed complete");
  } catch (err) {
    logger.warn({ err }, "Unmapped muscle VTM seed failed (non-fatal)");
  }

  await checkUnmappedMuscles();

  // Optional HOST (e.g. 127.0.0.1 on the GCP VM) — unset keeps the previous
  // behaviour of listening on all interfaces.
  const host = process.env["HOST"] || undefined;
  const onListen = (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, host }, "Server listening");
  };
  if (host) {
    app.listen(port, host, onListen);
  } else {
    app.listen(port, onListen);
  }
}

startServer();
