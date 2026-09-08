import { useAuth, useSignIn, useSignUp } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  ButtonContent,
  Field,
  GoogleMark,
  Notice,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  type NoticeTone
} from "./AuthFormPrimitives";
import { type AuthCopy, type AuthMode } from "./authConfig";
import { BrandName, PRODUCT_NAME } from "../brand/Brand";

type AuthStep = "credentials" | "verify-email" | "verify-sign-in";

const OAUTH_CALLBACK_PATH = "/sso-callback";
const MIN_PASSWORD_LENGTH = 8;
const GOOGLE_ACCOUNT_SELECTION_PROMPT = "select_account consent";
const CLIENT_TRUST_STATUS = "needs_client_trust";

export function ClerkAuthFlow({ mode, copy, redirectPath }: { mode: AuthMode; copy: AuthCopy; redirectPath: string }) {
  const authState = useAuth();
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const emailId = useId();
  const passwordId = useId();
  const codeId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState<AuthStep>("credentials");
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isLoaded = authState.isLoaded && signInState.isLoaded && signUpState.isLoaded;
  const isBusy = isSubmitting || isGoogleSubmitting || !isLoaded;
  const trimmedEmail = email.trim();

  const handleGoogleAuth = async () => {
    if (!isLoaded) {
      return;
    }

    setNotice(null);
    setIsGoogleSubmitting(true);

    try {
      if (authState.isSignedIn) {
        await authState.signOut();
      }

      const redirectParams = {
        strategy: "oauth_google" as const,
        redirectUrl: toCurrentOriginUrl(OAUTH_CALLBACK_PATH),
        actionCompleteRedirectUrl: toCurrentOriginUrl(redirectPath),
        oidcPrompt: GOOGLE_ACCOUNT_SELECTION_PROMPT
      };

      const externalRedirectUrl =
        mode === "sign-in"
          ? (await signInState.signIn.create(redirectParams)).firstFactorVerification.externalVerificationRedirectURL
          : (await signUpState.signUp.create(redirectParams)).verifications.externalAccount.externalVerificationRedirectURL;

      if (!externalRedirectUrl) {
        throw new Error("Google sign-in could not be started. Please try again.");
      }

      window.location.assign(withGoogleAccountSelection(externalRedirectUrl));
    } catch (error) {
      setNotice({ tone: "error", message: getAuthErrorMessage(error) });
      setIsGoogleSubmitting(false);
    }
  };

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isLoaded || !trimmedEmail || !password) {
      return;
    }

    setNotice(null);
    setIsSubmitting(true);

    try {
      if (mode === "sign-in") {
        const result = await signInState.signIn.create({
          identifier: trimmedEmail,
          password,
          strategy: "password"
        });

        if (result.status === "complete" && result.createdSessionId) {
          await signInState.setActive({ session: result.createdSessionId, redirectUrl: redirectPath });
          return;
        }

        if (result.status === "needs_second_factor") {
          const emailCodeFactor = result.supportedSecondFactors?.find(
            (factor) => factor.strategy === "email_code"
          );
          if (emailCodeFactor) {
            await signInState.signIn.prepareSecondFactor({
              strategy: "email_code",
              emailAddressId: emailCodeFactor.emailAddressId
            });
            setVerificationCode("");
            setStep("verify-sign-in");
            setNotice({ tone: "info", message: `We sent a verification code to ${trimmedEmail}.` });
            return;
          }
        }

        if (hasClientTrustStatus(result)) {
          await signInState.signIn.prepareSecondFactor({
            strategy: "email_code"
          });
          setVerificationCode("");
          setStep("verify-sign-in");
          setNotice({
            tone: "info",
            message: `New device detected. We sent a verification code to ${trimmedEmail}.`
          });
          return;
        }
        setNotice({
          tone: "error",
          message: "This account needs an additional verification step before it can open the workspace."
        });
        return;
      }

      const result = await signUpState.signUp.create({
        emailAddress: trimmedEmail,
        password
      });

      if (result.status === "complete" && result.createdSessionId) {
        await signUpState.setActive({ session: result.createdSessionId, redirectUrl: redirectPath });
        return;
      }

      await result.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify-email");
      setNotice({ tone: "info", message: `We sent a verification code to ${trimmedEmail}.` });
    } catch (error) {
      setNotice({ tone: "error", message: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isLoaded || !verificationCode.trim()) {
      return;
    }

    setNotice(null);
    setIsSubmitting(true);

    try {
      const result =
        step === "verify-sign-in"
          ? await signInState.signIn.attemptSecondFactor({ strategy: "email_code", code: verificationCode.trim() })
          : await signUpState.signUp.attemptEmailAddressVerification({ code: verificationCode.trim() });

      if (result.status === "complete" && result.createdSessionId) {
        const setActive = step === "verify-sign-in" ? signInState.setActive : signUpState.setActive;
        await setActive({ session: result.createdSessionId, redirectUrl: redirectPath });
        return;
      }

      setNotice({ tone: "error", message: "The verification code was accepted, but the account is not ready yet." });
    } catch (error) {
      setNotice({ tone: "error", message: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded) {
      return;
    }

    setNotice(null);
    setIsSubmitting(true);

    try {
      if (step === "verify-sign-in") {
        await signInState.signIn.prepareSecondFactor({ strategy: "email_code" });
      } else {
        await signUpState.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      }
      setNotice({ tone: "info", message: `A new code was sent to ${trimmedEmail}.` });
    } catch (error) {
      setNotice({ tone: "error", message: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "verify-email" || step === "verify-sign-in") {
    return (
      <form className="space-y-5" onSubmit={handleVerificationSubmit}>
        <Notice tone={notice?.tone ?? "info"} message={notice?.message ?? `Enter the code sent to ${trimmedEmail}.`} />

        <Field label="Verification code" htmlFor={codeId}>
          <input
            id={codeId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            className={inputClassName}
            placeholder="Enter the verification code"
            required
          />
        </Field>

        <button type="submit" className={primaryButtonClassName} disabled={isBusy}>
          <ButtonContent
            loading={isSubmitting}
            loadingLabel="Verifying"
            label={step === "verify-sign-in" ? "Verify code" : "Verify email"}
          />
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={handleResendCode}
            className="font-semibold text-sea hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={isBusy}
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setNotice(null);
            }}
            className="font-semibold text-slate-600 hover:text-ink disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={isBusy}
          >
            Change email
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" className={secondaryButtonClassName} onClick={handleGoogleAuth} disabled={isBusy}>
        <GoogleMark />
        <span className="min-w-0 text-center">{isGoogleSubmitting ? "Opening Google" : "Continue with Google"}</span>
      </button>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />
        <span>or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {notice ? <Notice tone={notice.tone} message={notice.message} /> : null}

      <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
        <Field label="Email address" htmlFor={emailId}>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassName}
            placeholder="Enter your email address"
            required
          />
        </Field>

        <Field label="Password" htmlFor={passwordId}>
          <div className="relative">
            <input
              id={passwordId}
              type={isPasswordVisible ? "text" : "password"}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClassName} pr-12`}
              placeholder="Enter your password"
              minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
              required
            />
            <button
              type="button"
              onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink focus-visible:outline focus-visible:outline-3 focus-visible:outline-teal-200"
              aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            >
              {isPasswordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </Field>

        <button type="submit" className={primaryButtonClassName} disabled={isBusy}>
          <ButtonContent loading={isSubmitting} loadingLabel={copy.loadingLabel} label={copy.submitLabel} />
        </button>
      </form>

      <p className="border-t border-slate-200 pt-4 text-center text-sm leading-6 text-slate-600">
        <SwitchPrompt prompt={copy.switchPrompt} />{" "}
        <Link to={copy.switchPath} className="font-semibold text-sea hover:text-teal-800">
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}

function toCurrentOriginUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export function withGoogleAccountSelection(redirectUrl: URL) {
  const url = new URL(redirectUrl.toString());
  url.searchParams.set("prompt", GOOGLE_ACCOUNT_SELECTION_PROMPT);
  url.searchParams.delete("authuser");
  url.searchParams.delete("login_hint");
  return url.toString();
}

function SwitchPrompt({ prompt }: { prompt: string }) {
  if (!prompt.includes(PRODUCT_NAME)) {
    return <>{prompt}</>;
  }

  return (
    <>
      {prompt.slice(0, prompt.indexOf(PRODUCT_NAME))}
      <BrandName />
      {prompt.slice(prompt.indexOf(PRODUCT_NAME) + PRODUCT_NAME.length)}
    </>
  );
}

function hasClientTrustStatus(result: { status: string | null }) {
  return result.status === CLIENT_TRUST_STATUS;
}

function getAuthErrorMessage(error: unknown) {
  if (isClerkAPIResponseError(error)) {
    const message = error.errors
      .map((apiError) => apiError.longMessage || apiError.message)
      .filter(Boolean)
      .join(" ");

    return message || "Authentication could not be completed. Please try again.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Authentication could not be completed. Please try again.";
}
