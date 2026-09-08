import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  cwd: () => string;
};

export default defineConfig(({ mode }) => {
  const workspaceRoot = `${process.cwd()}/..`;
  const env = {
    ...loadEnv(mode, workspaceRoot, ""),
    ...loadEnv(mode, process.cwd(), ""),
  };
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET;

  return {
    base: mode === "production" ? "/app/" : "/",
    envDir: workspaceRoot,
    plugins: [react()],
    server: {
      proxy: apiProxyTarget
        ? {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true
            }
          }
        : undefined
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./vitest.setup.ts",
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
      // Keep the suite hermetic: tests rely on a Clerk key being present
      // (the app gates auth on it) without depending on a real .env.
      env: {
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_ci_dummy",
        VITE_API_BASE_URL: "https://api.example.test"
      }
    }
  };
});
