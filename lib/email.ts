import "server-only";

import { Resend } from "resend";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(input: EmailInput) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "test") {
      console.info("Email delivery skipped because RESEND_API_KEY is not configured.");
    }
    return { skipped: true as const };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL ?? "Tokly <alerts@example.com>",
    ...input,
  });
  if (error) throw new Error(error.message);
  return { skipped: false as const, id: data?.id };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}
