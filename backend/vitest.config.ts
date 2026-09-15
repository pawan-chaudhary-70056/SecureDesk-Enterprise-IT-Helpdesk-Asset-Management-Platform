import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    fileParallelism: false,
  },
  plugins: [
    // Vitest uses esbuild, which cannot emit decorator metadata required by NestJS DI.
    swc.vite({ module: { type: "es6" } }),
  ],
});
