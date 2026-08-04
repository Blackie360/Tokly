"use client";

import { useActionState } from "react";
import { inviteMemberAction } from "@/app/actions";
import { initialFormState } from "@/lib/form-state";

export function InviteMemberForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialFormState);

  return (
    <form action={formAction} className="form-grid">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="field">
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" type="email" placeholder="teammate@example.com…" autoComplete="off" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="invite-role">Access level</label>
        <select id="invite-role" name="role" defaultValue="member">
          <option value="member">Member · can view data</option>
          <option value="admin">Admin · can manage setup</option>
        </select>
      </div>
      <button className="button" type="submit" disabled={pending}>{pending ? "Sending invitation…" : "Send invitation →"}</button>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}
