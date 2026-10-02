import { createVitestConfig } from "@quire/config/vitest";

export default createVitestConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
