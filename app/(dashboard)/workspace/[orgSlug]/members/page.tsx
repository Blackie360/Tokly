import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/overview";
import { InviteMemberForm } from "@/components/invite-member-form";
import styles from "@/components/dashboard/dashboard.module.css";
import { getDb } from "@/lib/db";
import { invitation, member, user } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const current = await requireWorkspace(orgSlug);
  const members = await getDb().select({ id: member.id, name: user.name, email: user.email, role: member.role, createdAt: member.createdAt }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, current.workspace.id)).orderBy(member.createdAt);
  const invites = await getDb().select().from(invitation).where(and(eq(invitation.organizationId, current.workspace.id), eq(invitation.status, "pending"))).orderBy(desc(invitation.createdAt));
  const canManage = /(owner|admin)/.test(current.workspace.role);
  return <>
    <PageHeader eyebrow="Team" title="Team members" description="Invite people to view usage, or give admins permission to manage apps and budgets." />
    <div className={styles.twoColumn}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>People with access</h2><span>{members.length} {members.length === 1 ? "person" : "people"}</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>{members.map((entry) => <tr key={entry.id}><td>{entry.name}</td><td>{entry.email}</td><td className="mono">{entry.role}</td><td>{formatDateTime(entry.createdAt.toISOString())}</td></tr>)}</tbody></table></div>{invites.length ? <div className={styles.panelBody}><div className="panel-label">Pending invitations</div>{invites.map((invite) => <p key={invite.id} className="muted">{invite.email} · {invite.role}</p>)}</div> : null}</section>
      <aside className={styles.panel}><div className={styles.panelHead}><h2>Invite a teammate</h2><span>By email</span></div><div className={styles.panelBody}>{canManage ? <InviteMemberForm orgSlug={orgSlug} /> : <p className="muted">Only owners and admins can invite people.</p>}</div></aside>
    </div>
  </>;
}
