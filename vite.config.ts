// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vite plugin that regenerates src/lib/admin/project-audit.ts from
// the live filesystem (routes, migrations, edge functions, package.json)
// before the build starts and on dev server startup.
function regenerateProjectAudit() {
  const run = (label: string) => {
    const script = join(__dirname, "scripts", "generate-project-audit.mjs");
    const result = spawnSync(process.execPath, [script], {
      stdio: "inherit",
      cwd: __dirname,
    });
    if (result.status !== 0) {
      console.warn(`[project-audit] ${label}: generator exited with ${result.status}`);
    }
  };
  return {
    name: "regenerate-project-audit",
    apply: () => true,
    buildStart() {
      run("buildStart");
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [regenerateProjectAudit()],
  },
});
