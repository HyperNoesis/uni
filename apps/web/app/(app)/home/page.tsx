"use client";
import Link from "next/link";
import { CAMPUSES } from "@campus/domain";
import { AppShell } from "../../../components/AppShell";
import { RoomEditor } from "../../../components/RoomEditor";
import { ProgressCard } from "../../../components/ProgressCard";

export default function Home() {
  return (
    <AppShell title="Home">
      {({ profile }) => (
        <>
          <section className="card hero-card">
            <p className="eyebrow">{CAMPUSES[profile.campus].name}</p>
            <h2>Welcome back, {profile.displayName}</h2>
            <p className="muted">Your life. Your campus. Your world. Finish today's tasks, get a campus job, then represent your campus.</p>
            <div className="home-actions"><Link className="btn accent" href="/play">Enter the world ↗</Link><Link className="btn ghost" href="/events">Campus Wars & activities</Link></div>
          </section>
          <ProgressCard />
          <section className="home-feature-grid">
            <Link className="card home-feature" href="/play"><span className="home-feature-icon">🌴</span><span><b>Explore your campus</b><small>Walk through the Commons, Library, Food Court and more.</small></span><strong>↗</strong></Link>
            <Link className="card home-feature" href="/events"><span className="home-feature-icon">🏆</span><span><b>Represent your campus</b><small>Earn points in weekly Campus Wars.</small></span><strong>↗</strong></Link>
            <Link className="card home-feature" href="/social"><span className="home-feature-icon">👥</span><span><b>Find your people</b><small>Meet classmates, make friends and join campus groups.</small></span><strong>↗</strong></Link>
            <Link className="card home-feature" href="/shop"><span className="home-feature-icon">🛍️</span><span><b>Decorate your room</b><small>Spend Campus Coins on furniture and cosmetics you can actually place.</small></span><strong>↗</strong></Link>
          </section>
          <section className="stats">
            <div className="card stat"><b>{profile.reputation}</b><span>Reputation</span></div>
            <div className="card stat"><b>{profile.coins}</b><span>Campus Coins</span></div>
          </section>
          <RoomEditor profile={profile} />
        </>
      )}
    </AppShell>
  );
}
