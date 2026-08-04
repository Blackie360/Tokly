"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MouseEvent, useEffect, useRef, useState } from "react";

export function NavLink({ href, label, index }: { href: string; label: string; index: string }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const [hrefPath, hrefHash = ""] = href.split("#");
  const active = hrefHash
    ? pathname === hrefPath && hash === `#${hrefHash}`
    : (pathname === hrefPath && !hash) || pathname.startsWith(`${href}/`);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash);
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!hrefHash || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const nextHash = `#${hrefHash}`;
    window.history.pushState(null, "", nextHash);
    setHash(nextHash);
    window.dispatchEvent(new Event("hashchange"));
    document.getElementById(hrefHash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (active && window.matchMedia("(max-width: 900px)").matches) {
      linkRef.current?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    }
  }, [active]);

  return (
    <Link ref={linkRef} href={href as never} aria-current={active ? "page" : undefined} onClick={handleClick}>
      <span>{index}</span>{label}
    </Link>
  );
}
