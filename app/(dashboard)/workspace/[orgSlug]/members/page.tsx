import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { inviteMemberAction } from "@/app/actions";
import { PageHeader } from "@/components/dashboard/overview";
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
    <PageHeader eyebrow="Access control / 05" title="Workspace members" description="Owners and admins manage instrumentation; members receive read-only operational access." />
    <div className={styles.twoColumn}>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Operators</h2><span>{members.length} members</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>{members.map((entry) => <tr key={entry.id}><td>{entry.name}</td><td>{entry.email}</td><td className="mono">{entry.role}</td><td>{formatDateTime(entry.createdAt.toISOString())}</td></tr>)}</tbody></table></div>{invites.length ? <div className={styles.panelBody}><div className="panel-label">Pending invitations</div>{invites.map((invite) => <p key={invite.id} className="muted">{invite.email} · {invite.role}</p>)}</div> : null}</section>
      <aside className={styles.panel}><div className={styles.panelHead}><h2>Invite operator</h2><span>Email invitation</span></div><div className={styles.panelBody}>{canManage ? <form action={inviteMemberAction} className="form-grid"><input type="hidden" name="orgSlug" value={orgSlug}/><div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" placeholder="operator@example.com" required/></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" name="role"><option value="member">Member · read only</option><option value="admin">Admin · manage platform</option></select></div><button className="button" type="submit">Send invitation →</button></form> : <p className="muted">Only owners and admins can invite people.</p>}</div></aside>
    </div>
  </>;
}
