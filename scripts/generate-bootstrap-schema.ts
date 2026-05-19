import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outPath = path.join("prisma", "bootstrap-schema.sql");
const sql = execSync(
  "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
  { encoding: "utf8" },
);
fs.writeFileSync(outPath, sql, "utf8");
console.log(`Wrote ${outPath} (${sql.length} bytes)`);
