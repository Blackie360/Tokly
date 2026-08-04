"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./auth-form.module.css";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");

    const requestedReturn = searchParams.get("returnTo");
    const returnTo: Route = requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//")
      ? requestedReturn as Route
      : "/onboarding";
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password, callbackURL: returnTo })
        : await authClient.signIn.email({ email, password, callbackURL: returnTo });

    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  return (
    <div>
      <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
        <button type="button" role="tab" aria-selected={mode === "sign-in"} onClick={() => setMode("sign-in")}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "sign-up"} onClick={() => setMode("sign-up")}>Create account</button>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <div className="field"><label htmlFor="name">Full name</label><input id="name" name="name" minLength={2} maxLength={80} autoComplete="name" required /></div>
        ) : null}
        <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required /></div>
        {error ? <p className="error-copy" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={pending}>{pending ? "Working…" : mode === "sign-up" ? "Create account →" : "Sign in →"}</button>
      </form>
    </div>
  );
}
