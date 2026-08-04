"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  label,
  confirmation,
  ariaLabel,
}: {
  label: string;
  confirmation: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  function confirmSubmit(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return <button className="button danger" type="submit" aria-label={ariaLabel} onClick={confirmSubmit} disabled={pending}>{pending ? "Working…" : label}</button>;
}
