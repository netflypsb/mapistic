"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Dawnistic account button — canonical copy for Mapistic (same pattern as
 * hub/prism/reastic/agentora/tulistic). Talks to the hub auth API cross-origin
 * with cookies (identity service CORS/trustedOrigins must allow this origin).
 *
 * Logged out  → "Login" pill → identity service sign-in
 * Logged in   → username pill; menu: Home / Dashboard / Credits (main dawnistic
 *               dashboard + wallet), Change name, Logout (shared cookie = logs
 *               out every product at once).
 */

const HUB = process.env.NEXT_PUBLIC_HUB_URL || "";

type SessionUser = { name?: string | null; email?: string | null };

function displayName(u: SessionUser): string {
  if (u.name) return u.name;
  if (u.email) return u.email.split("@")[0];
  return "Account";
}

export function AccountButton({ signOutRedirect }: { signOutRedirect?: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${HUB}/api/auth/get-session`, {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const data = res.ok ? await res.json() : null;
        if (alive) {
          setUser(data?.user ?? null);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch(`${HUB}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      /* treat as done — no valid session remains usable */
    }
    setBusy(false);
    setOpen(false);
    window.location.href = signOutRedirect ?? `${HUB}/`;
  }

  async function rename() {
    const next = window.prompt("Display name", displayName(user ?? {}));
    if (next == null || !next.trim() || next.trim() === displayName(user ?? {})) return;
    setBusy(true);
    try {
      const res = await fetch(`${HUB}/api/auth/update-user`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next.trim() }),
      });
      if (res.ok) setUser({ ...user, name: next.trim() });
    } catch {
      /* ignore */
    }
    setBusy(false);
    setOpen(false);
  }

  if (!loaded) return <span className="acct-btn acct-btn-skeleton" aria-hidden>&nbsp;</span>;

  if (!user) {
    return (
      <a href={`${HUB}/sign-in`} className="acct-btn" rel="noopener">
        Login
      </a>
    );
  }

  const name = displayName(user);
  return (
    <div className="acct-wrap" ref={ref}>
      <button
        type="button"
        className={`acct-btn acct-btn-user${open ? " open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ maxWidth: "240px" }}
      >
        <span className="acct-avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
        <span className="acct-name">{name}</span>
        <span className={`acct-caret${open ? " open" : ""}`}>&#9662;</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <a className="acct-menu-item acct-menu-home" href={`${HUB}/`} role="menuitem">
            Home
          </a>
          <a className="acct-menu-item acct-menu-dashboard" href={`${HUB}/dashboard`} role="menuitem">
            Dashboard
          </a>
          <a className="acct-menu-item acct-menu-credits" href={`${HUB}/credits`} role="menuitem">
            Credits
          </a>
          <button
            type="button"
            className="acct-menu-item acct-menu-rename"
            onClick={rename}
            disabled={busy}
            role="menuitem"
          >
            Change name
          </button>
          <div className="acct-menu-divider" />
          <button
            type="button"
            className="acct-menu-item acct-menu-logout"
            onClick={logout}
            disabled={busy}
            role="menuitem"
          >
            {busy ? "Logging out…" : "Logout"}
          </button>
        </div>
      )}
    </div>
  );
}

export default AccountButton;