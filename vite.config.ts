import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ command, mode }) => {
  // Library build: npm run build
  if (command === "build" && mode !== "demo") {
    return {
      plugins: [dts({ rollupTypes: true })],
      build: {
        lib: {
          entry: resolve(__dirname, "src/index.ts"),
          formats: ["es", "cjs"],
          fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
        },
        rollupOptions: {
          external: ["react", "react-dom", "react/jsx-runtime"],
        },
      },
      resolve: {
        alias: {
          "@core": resolve(__dirname, "src/core"),
          "@react": resolve(__dirname, "src/react"),
          "@ui": resolve(__dirname, "src/ui"),
        },
      },
    };
  }

  // Demo build (GitHub Pages): npm run build:demo
  if (command === "build" && mode === "demo") {
    return {
      root: "demo",
      base: "/wick/",
      build: {
        outDir: resolve(__dirname, "docs"),
        emptyOutDir: true,
      },
      resolve: {
        alias: {
          "@core": resolve(__dirname, "src/core"),
          "@react": resolve(__dirname, "src/react"),
          "@ui": resolve(__dirname, "src/ui"),
        },
      },
    };
  }

  // Dev server: npm run dev
  return {
    root: "demo",
    resolve: {
      alias: {
        "@core": resolve(__dirname, "src/core"),
        "@react": resolve(__dirname, "src/react"),
        "@ui": resolve(__dirname, "src/ui"),
      },
    },
  };
});
