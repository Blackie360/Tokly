"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, index }: { href: string; label: string; index: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href as never} aria-current={active ? "page" : undefined}>
      <span>{index}</span>{label}
    </Link>
  );
}
