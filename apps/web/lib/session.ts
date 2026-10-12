"use client";
import { useEffect, useState } from "react";
import type { PlayerProfile } from "@campus/domain";
import { api, clearToken, getToken } from "./api";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; profile: PlayerProfile }
  | { status: "error"; message: string };

/** Reads the existing signed session token and loads the profile via GET /api/v1/me. */
export function useSession(): SessionState & { retry: () => void; signOut: () => void } {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!getToken()) { setState({ status: "anonymous" }); return; }
    let live = true;
    const refresh = () => setN((x) => x + 1);
    window.addEventListener("campus:session-refresh", refresh);
    setState({ status: "loading" });
    api.me()
      .then((r) => live && setState({ status: "ready", profile: r.profile }))
      .catch((e: { status?: number; message?: string }) => {
        if (!live) return;
        if (e.status === 401) { clearToken(); setState({ status: "anonymous" }); }
        else setState({ status: "error", message: "Can't reach CAMPUS right now. Check your connection." });
      });
    return () => { live = false; window.removeEventListener("campus:session-refresh", refresh); };
  }, [n]);
  return { ...state, retry: () => setN((x) => x + 1), signOut: () => { clearToken(); setState({ status: "anonymous" }); } };
}
