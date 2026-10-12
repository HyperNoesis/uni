import Link from "next/link";
export const metadata = { title: "FAQ — CAMPUS" };
export default function Page() {
  return (
    <main className="shell"><div className="onb doc">
      <Link className="logo" href="/">CAMP<span>US</span></Link>
      <h2>FAQ</h2>
      <p><b>What is CAMPUS?</b><br /><span className="muted">A browser-based campus world where you build an identity, meet people and represent your campus.</span></p>
      <p><b>Do I need to download anything?</b><br /><span className="muted">No. It runs in your browser and can be installed to your home screen.</span></p>
      <p><b>Is it free?</b><br /><span className="muted">Yes. Spending is never required to compete.</span></p>
      <p><b>Are the universities real?</b><br /><span className="muted">No. They are fictional. Real campuses will only appear with permission.</span></p>
      <Link className="btn" href="/start">Play now</Link>
    </div></main>
  );
}
