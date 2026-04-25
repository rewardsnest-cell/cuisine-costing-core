// Tailwind v4 uses CSS-based config (see src/styles.css). This file exists
// only to satisfy tooling that expects a tailwind.config.ts at the project root.
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
