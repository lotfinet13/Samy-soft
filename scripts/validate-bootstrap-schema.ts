import { detectBootstrapSchemaDrift } from "./bootstrap-schema-drift.js";

const result = detectBootstrapSchemaDrift();
if (result.driftDetected) {
  console.error("[bootstrap-schema] DRIFT DETECTED");
  console.error(result.detail ?? "unknown");
  process.exit(1);
}
console.log("[bootstrap-schema] OK — bootstrap-schema.sql matches prisma/schema.prisma");
