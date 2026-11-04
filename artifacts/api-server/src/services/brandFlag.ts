/** Nowe logo i byczek (BRAND_V1_ENABLED, domyślnie wyłączone) — wspólne dla trasy statusu i maili. */
export const brandV1Enabled = (env: NodeJS.ProcessEnv = process.env) => env.BRAND_V1_ENABLED === "1";
