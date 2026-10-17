"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLockup } from "../components/BrandMark";
import { GateScene } from "../components/GateScene";
import { lagosSky, type LagosSky } from "../lib/lagos-time";

const LINES: Record<string, string> = { Daylight: "Your campus is open.", "Golden hour": "The light is perfect. Come in.", Dusk: "The day is winding down. Come in.", Dawn: "Early start. The gate is open.", Night: "The campus never fully sleeps." };

export default function Landing() {
  const [sky, setSky] = useState<LagosSky | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setSky(lagosSky()); const id = setInterval(() => setSky(lagosSky()), 30_000); return () => clearInterval(id); }, []);
  const phase = sky?.phase ?? "day";
  return (
    <main className={`gate-landing phase-${phase}`}>
      <GateScene onReady={() => setReady(true)} />
      <div className={"gl-veil" + (ready ? " on" : "")} aria-hidden="true" />
      <header className="gl-top">
        <Link href="/" aria-label="CAMPUS home"><BrandLockup size={34} /></Link>
        <nav aria-label="Primary"><Link href="/faq">FAQ</Link><Link href="/safety">Safety</Link><Link href="/home">Resume</Link>
          {sky && <span className="gl-clock" title="The world follows Lagos time"><i className={"dot " + (sky.night > 0.5 ? "moon" : "sun")} />Lagos {sky.clock} · {sky.label}</span>}</nav>
      </header>
      <section className="gl-hero">
        <p className="gl-eyebrow">{sky ? sky.greeting : "Welcome"} · A Nigerian campus world</p>
        <h1>{LINES[sky?.label ?? "Daylight"]}</h1>
        <p className="gl-sub">Walk through the gate into a live, shared campus, in your browser. No download.</p>
        <div className="gl-cta"><Link className="btn big accent" href="/start">Enter campus <span aria-hidden="true">→</span></Link><Link className="gl-link" href="/home">I already have a session</Link></div>
      </section>
      <footer className="gl-foot"><ul><li>Live with real people</li><li>Server-fair competition</li><li>Moderated and safe by design</li></ul>
        <p>CAMPUS is a fictional world. Campus Coins have no cash value. <Link href="/safety">Safety</Link> · <Link href="/faq">FAQ</Link></p></footer>
    </main>
  );
}
