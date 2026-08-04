import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { getCurrentSession } from "@/lib/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = (await searchParams).returnTo;
  const safeReturnTo: Route = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo as Route : "/onboarding";
  if (await getCurrentSession()) redirect(safeReturnTo);
  return (
    <main id="main-content" className={styles.shell}>
      <section className={styles.context}>
        <Logo />
        <div><div className="eyebrow">AI usage, made clear</div><h1>Know what your AI costs.</h1></div>
        <p className="mono">No prompts. No completions. No provider credentials. Only the operational metadata you choose to send.</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formCard}><div className="coordinate">TOKLY ACCOUNT</div><AuthForm /></div>
      </section>
    </main>
  );
}
