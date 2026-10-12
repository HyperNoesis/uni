"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "../../lib/session";

export default function SignIn() {
  const router = useRouter();
  const s = useSession();
  useEffect(() => { if (s.status === "ready") router.replace("/home"); }, [s.status, router]);
  return (
    <main className="shell">
      <div className="onb">
        <Link className="logo" href="/">CAMP<span>US</span></Link>
        <h2>Welcome to CAMPUS</h2>
        {s.status === "loading" && <p className="muted" role="status">Checking for a saved session…</p>}
        {s.status === "error" && <div role="alert"><p className="err">{s.message}</p><button className="btn" onClick={s.retry}>Try again</button></div>}
        {s.status === "anonymous" && (
          <>
            <p className="muted">No saved identity on this device. Create one in under a minute. No email or phone needed yet.</p>
            <Link className="btn big accent" href="/start">Create your identity</Link>
          </>
        )}
      </div>
    </main>
  );
}
