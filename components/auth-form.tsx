"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./auth-form.module.css";

type SocialProvider = "github" | "google";

function nameFromEmail(email: string) {
  const localPart = email.split("@", 1)[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) return "Tokly user";

  return localPart
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 80);
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.5c2-1.9 3.2-4.6 3.2-7.7Z" />
      <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.5-2.7c-.9.6-2.1 1-3.4 1a6.1 6.1 0 0 1-5.7-4.2H2.8v2.8A10.4 10.4 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.3 13.6a6.2 6.2 0 0 1 0-3.9V6.9H2.8a10.3 10.3 0 0 0 0 9.4l3.5-2.7Z" />
      <path fill="#EA4335" d="M12 5.5c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.8 6.9l3.5 2.8A6.1 6.1 0 0 1 12 5.5Z" />
    </svg>
  );
}

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in",
  );
  const [error, setError] = useState("");
  const [pendingProvider, setPendingProvider] = useState<"email" | SocialProvider | null>(null);

  function getReturnTo(): Route {
    const requestedReturn = searchParams.get("returnTo");
    return requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//")
      ? requestedReturn as Route
      : "/onboarding";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPendingProvider("email");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const returnTo = getReturnTo();
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: nameFromEmail(email), email, password, callbackURL: returnTo })
        : await authClient.signIn.email({ email, password, callbackURL: returnTo });

    setPendingProvider(null);
    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    setError("");
    setPendingProvider(provider);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: getReturnTo(),
    });

    if (result.error) {
      setError(result.error.message ?? `Could not continue with ${provider === "github" ? "GitHub" : "Google"}.`);
      setPendingProvider(null);
    }
  }

  const pending = pendingProvider !== null;

  function changeMode(nextMode: "sign-in" | "sign-up") {
    setMode(nextMode);
    setError("");
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "sign-up") params.set("mode", "sign-up");
    else params.delete("mode");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/sign-in?${query}` : "/sign-in");
  }

  function handleModeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextMode = mode === "sign-in" ? "sign-up" : "sign-in";
    changeMode(nextMode);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[role="tab"][aria-selected="true"]`)?.focus();
    });
  }

  return (
    <div className={styles.authContent}>
      <div className={styles.authHeading}>
        <h2>{mode === "sign-up" ? "Create your account" : "Welcome back"}</h2>
        <p>{mode === "sign-up" ? "Choose a quick sign-up option or use your email." : "Sign in with a connected account or your email."}</p>
      </div>
      <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
        <button type="button" role="tab" aria-selected={mode === "sign-in"} tabIndex={mode === "sign-in" ? 0 : -1} onKeyDown={handleModeKeyDown} onClick={() => changeMode("sign-in")}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "sign-up"} tabIndex={mode === "sign-up" ? 0 : -1} onKeyDown={handleModeKeyDown} onClick={() => changeMode("sign-up")}>Create account</button>
      </div>
      <div className={styles.socialProviders}>
        <button className={`${styles.socialButton} button secondary`} type="button" disabled={pending} onClick={() => handleSocialSignIn("github")}>
          <GitHubIcon />
          {pendingProvider === "github" ? "Connecting…" : "Continue with GitHub"}
        </button>
        <button className={`${styles.socialButton} button secondary`} type="button" disabled={pending} onClick={() => handleSocialSignIn("google")}>
          <GoogleIcon />
          {pendingProvider === "google" ? "Connecting…" : "Continue with Google"}
        </button>
      </div>
      <div className={styles.divider}><span /><span>or use email</span><span /></div>
      {error ? <p className="error-copy" role="alert">{error}</p> : null}
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required />{mode === "sign-up" ? <small className="field-help">Use at least 8 characters.</small> : null}</div>
        <button className="button" type="submit" disabled={pending}>{pendingProvider === "email" ? "Working…" : mode === "sign-up" ? "Create account →" : "Sign in →"}</button>
      </form>
    </div>
  );
}
