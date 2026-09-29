// The Firestore rules tests (rules-tests/), which need the emulator:
// `npm run test:rules`. Kept apart from `npm test`, which runs anywhere.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["rules-tests/**/*.js"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
