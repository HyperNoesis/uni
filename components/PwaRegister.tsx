"use client";
import { useEffect, useState } from "react";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* non-fatal */ });
    }
  }, []);
  return null;
}

export function InstallButton() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!ev) return null;
  return <button className="btn ghost" onClick={async () => { await ev.prompt(); setEv(null); }}>Install app</button>;
}
