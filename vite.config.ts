// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    resolve: {
      alias: {
        htmlparser2: resolve(__dirname, "node_modules/htmlparser2/lib/esm/index.js"),
        "htmlparser2/dist/esm/index.js": resolve(__dirname, "node_modules/htmlparser2/lib/esm/index.js"),
      },
    },
    plugins: [regenerateProjectAudit()],
  },
});
