// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

/** Vite plugin: touches a marker file after each MDX rebuild. */
function printPreviewPlugin() {
  return {
    name: "print-preview-trigger",
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (!path.endsWith(".mdx")) return;
        if (!existsSync(".pi")) mkdirSync(".pi");
        setTimeout(() => {
          writeFileSync(".pi/print-rebuild-trigger", Date.now().toString());
        }, 100);
      });
    },
  };
}

const plugins = [];
if (process.env.PRINT_PREVIEW) {
  plugins.push(printPreviewPlugin());
}

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
  vite: { plugins },
});
