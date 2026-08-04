"use client";

import { useActionState, useState } from "react";
import { createBudgetAction } from "@/app/actions";
import { initialFormState } from "@/lib/form-state";

export function BudgetForm({
  orgSlug,
  projects,
  defaultEmail,
}: {
  orgSlug: string;
  projects: Array<{ id: string; name: string }>;
  defaultEmail: string;
}) {
  const [scope, setScope] = useState<"organization" | "project">("organization");
  const [state, formAction, pending] = useActionState(createBudgetAction, initialFormState);

  return (
    <form action={formAction} className="form-grid">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="field">
        <label htmlFor="name">Budget name</label>
        <input id="name" name="name" placeholder="Monthly AI budget…" autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="scope">Budget applies to</label>
        <select id="scope" name="scope" value={scope} onChange={(event) => setScope(event.target.value as "organization" | "project")}>
          <option value="organization">All apps in this workspace</option>
          <option value="project">One app only</option>
        </select>
      </div>
      {scope === "project" ? (
        <div className="field">
          <label htmlFor="projectId">App</label>
          <select id="projectId" name="projectId" required>
            <option value="">Choose an app</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="monthlyLimitUsd">Monthly target (USD)</label>
        <input id="monthlyLimitUsd" name="monthlyLimitUsd" type="number" inputMode="decimal" min="1" step="0.01" placeholder="300.00…" autoComplete="off" aria-describedby="budget-limit-help" required />
        <small className="field-help" id="budget-limit-help">Tokly sends alerts at 50%, 80%, and 100%. It does not block requests.</small>
      </div>
      <div className="field">
        <label htmlFor="alertEmail">Send alerts to</label>
        <input id="alertEmail" name="alertEmail" type="email" defaultValue={defaultEmail} autoComplete="email" spellCheck={false} required />
      </div>
      <button className="button" type="submit" disabled={pending}>{pending ? "Creating budget…" : "Create budget →"}</button>
      <p className={`form-message ${state.status}`} aria-live="polite">{state.message}</p>
    </form>
  );
}
