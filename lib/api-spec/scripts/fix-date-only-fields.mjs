#!/usr/bin/env node
/**
 * orval's zod generator does not distinguish OpenAPI `format: date` (date-only)
 * from `format: date-time` (timestamp) once `useDates`/coerce is enabled for
 * dates: both come out as `zod.coerce.date()`, which JSON-serializes as a full
 * ISO timestamp and breaks anything bound to `<input type="date">`.
 *
 * This script runs right after `orval` in the `codegen` script. It reads the
 * OpenAPI spec to find every property with `format: date` (not `date-time`),
 * then rewrites the matching `zod.coerce.date()` calls in the generated
 * `api.ts` to use the shared `dateOnly` schema from `@workspace/api-zod`
 * instead, so any new date-only field is fixed automatically the next time
 * codegen runs — no per-route patching required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiSpecDir = path.resolve(__dirname, "..");
const root = path.resolve(apiSpecDir, "..", "..");
const specPath = path.join(apiSpecDir, "openapi.yaml");
const generatedPath = path.join(root, "lib", "api-zod", "src", "generated", "api.ts");

function findDateOnlyFieldNames(specText) {
  const lines = specText.split("\n");
  const fields = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!/format:\s*date\s*$/.test(lines[i])) continue; // matches "date" but not "date-time"
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const match = lines[j].match(/^\s*(\w+):\s*$/);
      if (match) {
        fields.add(match[1]);
        break;
      }
    }
  }
  return fields;
}

function main() {
  const specText = fs.readFileSync(specPath, "utf8");
  const fieldNames = findDateOnlyFieldNames(specText);

  if (fieldNames.size === 0) {
    return;
  }

  let generatedText = fs.readFileSync(generatedPath, "utf8");
  let replacedCount = 0;

  for (const field of fieldNames) {
    const pattern = new RegExp(`("${field}":\\s*)zod\\.coerce\\.date\\(\\)`, "g");
    generatedText = generatedText.replace(pattern, (fullMatch, prefix) => {
      replacedCount++;
      return `${prefix}dateOnly`;
    });
  }

  if (replacedCount === 0) {
    return;
  }

  if (!generatedText.includes(`from "./date-only"`)) {
    generatedText = generatedText.replace(
      `import * as zod from 'zod';`,
      `import * as zod from 'zod';\nimport { dateOnly } from "../date-only";`,
    );
  }

  fs.writeFileSync(generatedPath, generatedText);
  console.log(
    `[fix-date-only-fields] Rewrote ${replacedCount} field(s) (${[...fieldNames].join(", ")}) to use the shared dateOnly schema.`,
  );
}

main();
