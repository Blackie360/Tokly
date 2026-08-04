import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acceptInvitationAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { getCurrentSession } from "@/lib/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (!id) redirect("/sign-in?error=invalid-invitation");
  if (!(await getCurrentSession())) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(`/accept-invitation?id=${id}`)}`);
  }

  return (
    <main id="main-content" className={styles.shell}>
      <section className={styles.context}>
        <Logo />
        <div><div className="eyebrow">Workspace invitation</div><h1>Join the operations room.</h1></div>
        <p className="mono">Membership grants access to usage telemetry, app health, and the controls allowed by your assigned role.</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <div className="coordinate">TM-INVITE / 001</div>
          <h2>Accept workspace invitation</h2>
          <p>Continue with your signed-in account. The invitation email must match your account.</p>
          <form action={acceptInvitationAction} className="form-grid">
            <input type="hidden" name="invitationId" value={id} />
            <button className="button" type="submit">Accept invitation →</button>
          </form>
        </div>
      </section>
    </main>
  );
}
