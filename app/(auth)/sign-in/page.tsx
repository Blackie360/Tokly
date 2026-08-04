import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { getCurrentSession } from "@/lib/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentSession()) redirect("/onboarding");
  return (
    <main id="main-content" className={styles.shell}>
      <section className={styles.context}>
        <Logo />
        <div><div className="eyebrow">Secure workspace access</div><h1>Control the cost curve.</h1></div>
        <p className="mono">No prompts. No completions. No provider credentials. Only the operational metadata you choose to send.</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formCard}><div className="coordinate">TM-AUTH / 001</div><h2>Enter the operations room</h2><p>Use your work email to continue.</p><AuthForm /></div>
      </section>
    </main>
  );
}
