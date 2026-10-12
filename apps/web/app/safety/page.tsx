import Link from "next/link";
export const metadata = { title: "Safety — CAMPUS" };
export default function Page() {
  return (
    <main className="shell"><div className="onb doc">
      <Link className="logo" href="/">CAMP<span>US</span></Link>
      <h2>Safety</h2>
      <p className="muted">CAMPUS is built to be safe by default. Movement, rewards and rankings are decided by the server. Campus Coins are an in-game currency with no cash value, and there is no gambling or betting.</p>
      <p className="muted">Blocking, muting, reporting and moderation arrive with the social system in Phase 5. We collect no personal data today: sessions are anonymous.</p>
      <Link className="btn" href="/start">Play now</Link>
    </div></main>
  );
}
