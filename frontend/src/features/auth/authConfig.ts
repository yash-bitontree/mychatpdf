import { PRODUCT_NAME } from "../brand/Brand";

export type AuthMode = "sign-in" | "sign-up";

export interface AuthCopy {
  eyebrow: string;
  title: string;
  submitLabel: string;
  loadingLabel: string;
  switchPrompt: string;
  switchLabel: string;
  switchPath: string;
}

export const DEFAULT_REDIRECT_PATH = "/app";

export const authCopy = {
  "sign-in": {
    eyebrow: "Welcome back",
    title: `Sign in to ${PRODUCT_NAME}`,
    submitLabel: "Sign in",
    loadingLabel: "Signing in",
    switchPrompt: "New to MyPDFChat?",
    switchLabel: "Create an account",
    switchPath: "/sign-up"
  },
  "sign-up": {
    eyebrow: "New workspace",
    title: `Create your ${PRODUCT_NAME} account`,
    submitLabel: "Create account",
    loadingLabel: "Creating account",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchPath: "/sign-in"
  }
} satisfies Record<AuthMode, AuthCopy>;
