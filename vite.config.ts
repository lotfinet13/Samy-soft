/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "recharts";
          if (id.includes("node_modules/@tanstack")) return "tanstack";
          if (id.includes("node_modules/lucide-react")) return "icons";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "json"],
      reportsDirectory: "coverage",
      include: [
        "electron/utils/serialize-for-ipc.ts",
        "electron/services/inventory-costing.ts",
        "electron/ipc/dto/inventory-dto.ts",
        "src/hooks/useAsyncLoad.ts",
        "shared/ipc-channel-policy.ts",
        "shared/migration-drift.ts",
      ],
      thresholds: {
        "electron/utils/serialize-for-ipc.ts": { lines: 58, functions: 65, branches: 55, statements: 55 },
        "electron/services/inventory-costing.ts": { lines: 78, functions: 78, branches: 70, statements: 75 },
        "electron/ipc/dto/inventory-dto.ts": { lines: 25, functions: 20, branches: 20, statements: 25 },
        "src/hooks/useAsyncLoad.ts": { lines: 85, functions: 70, branches: 65, statements: 85 },
        "shared/ipc-channel-policy.ts": { lines: 90, functions: 90, branches: 85, statements: 90 },
        "shared/migration-drift.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
