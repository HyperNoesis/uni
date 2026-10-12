import Link from "next/link";

export default function Landing() {
  return (
    <main className="landing">
      <nav className="nav">
        <div className="logo">CAMP<span>US</span></div>
        <div className="nav-links"><Link href="/faq">FAQ</Link><Link href="/safety">Safety</Link><Link className="btn ghost" href="/home">Resume</Link></div>
      </nav>

      <section className="hero">
        <div>
          <h1>Your life.<br />Your campus.<br /><em>Your world.</em></h1>
          <p>
            Build your identity, walk into a live campus with real people, and start representing your school.
            No download. Runs in your browser, on any phone.
          </p>
          <Link className="btn big accent" href="/start">Play now</Link>
        </div>
        <div className="hero-art card" aria-hidden="true">
          <svg viewBox="0 0 440 400" role="img" aria-label="Illustrated campus plaza with students and university buildings">
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3c82" /><stop offset=".62" stopColor="#6c8ddd" /><stop offset="1" stopColor="#f3bd94" /></linearGradient>
              <linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fb286" /><stop offset="1" stopColor="#17694f" /></linearGradient>
              <linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e5d8b8" /><stop offset="1" stopColor="#b8a17a" /></linearGradient>
              <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c8f5ff" /><stop offset="1" stopColor="#5182bf" /></linearGradient>
              <filter id="sun-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12" /></filter>
            </defs>
            <rect width="440" height="400" fill="url(#sky)" />
            <circle cx="349" cy="73" r="47" fill="#ffd166" opacity=".14" filter="url(#sun-glow)" />
            <circle cx="349" cy="73" r="24" fill="#ffe5a1" />
            <path d="M0 154 Q60 109 118 153 T234 147 T440 132 L440 258 L0 258Z" fill="#557db6" opacity=".55" />
            <path d="M0 187 Q80 151 148 187 T283 175 T440 168 L440 276 L0 276Z" fill="#345f83" opacity=".58" />
            <g fill="#fff" opacity=".42"><path d="M42 69c4-13 20-16 29-6 9-2 18 4 18 13H37c-4-4-1-7 5-7Z"/><path d="M250 113c4-10 16-13 24-5 8-2 16 3 16 10h-47c-4-3-1-5 7-5Z"/></g>
            <path d="M0 219 L440 195 L440 400 L0 400Z" fill="url(#lawn)" />
            <path d="M184 196 L258 193 L360 400 L92 400Z" fill="url(#path)" />
            <path d="M206 195 L235 194 L257 400 L192 400Z" fill="#f4e9cf" opacity=".55" />
            <g transform="translate(86 132)">
              <rect x="-47" y="42" width="98" height="70" rx="4" fill="#182c50" opacity=".2"/>
              <rect x="-43" y="23" width="96" height="87" rx="3" fill="#f2c982" />
              <path d="M-52 25 L3 -4 L62 25Z" fill="#f7e7c4" />
              <rect x="-4" y="67" width="19" height="43" rx="2" fill="#34466b" />
              {[-30,-8,14,36].map((x) => <g key={x}><rect x={x} y="43" width="13" height="17" rx="2" fill="url(#glass)"/><rect x={x+3} y="45" width="2" height="12" fill="#fff" opacity=".35"/></g>)}
              <rect x="-44" y="21" width="99" height="5" fill="#fff0d5" />
            </g>
            <g transform="translate(220 97)">
              <rect x="-84" y="58" width="168" height="104" rx="5" fill="#314a70" opacity=".22" />
              <rect x="-80" y="37" width="160" height="122" rx="4" fill="#e9eef8" />
              <path d="M-90 40 L0 -4 L90 40Z" fill="#fff4dc" />
              <rect x="-70" y="48" width="140" height="8" fill="#7c91c3" />
              <rect x="-62" y="64" width="124" height="95" fill="#7b9ac7" />
              {[-52,-27,-2,23,48].map((x) => <g key={x}><rect x={x} y="71" width="14" height="28" rx="2" fill="url(#glass)"/><rect x={x} y="107" width="14" height="24" rx="2" fill="url(#glass)"/></g>)}
              <rect x="-15" y="124" width="30" height="35" rx="2" fill="#283653" />
              <rect x="-80" y="155" width="160" height="6" fill="#fff1d2" />
              <rect x="-43" y="17" width="86" height="8" rx="4" fill="#2f6bff" />
            </g>
            <g transform="translate(354 161)">
              <rect x="-36" y="30" width="72" height="72" rx="3" fill="#ddad6b" />
              <path d="M-43 31 L0 9 L43 31Z" fill="#f8e3b8" />
              {[-21,0,21].map((x) => <rect key={x} x={x-5} y="43" width="10" height="20" rx="2" fill="#5782b1"/>)}
              <rect x="-7" y="73" width="14" height="29" fill="#334564" />
            </g>
            <g fill="#1a6848"><ellipse cx="30" cy="252" rx="31" ry="45"/><ellipse cx="401" cy="245" rx="28" ry="42"/><ellipse cx="111" cy="257" rx="22" ry="30"/><ellipse cx="324" cy="244" rx="24" ry="32"/></g>
            <g transform="translate(31 207)"><path d="M-3 35 Q3 8 0 -8" stroke="#805c3e" strokeWidth="7" fill="none"/><path d="M0 -5 Q-31 -20 -42 -4 Q-19 -5 -1 2 Q-20 -22 -33 -24 Q-18 -6 0 2 Q12 -30 26 -29 Q16 -9 2 3 Q36 -11 43 2 Q23 -1 3 7" fill="#3ab277"/></g>
            <g transform="translate(406 201)"><path d="M-3 42 Q4 10 0 -8" stroke="#805c3e" strokeWidth="7" fill="none"/><path d="M0 -5 Q-31 -20 -42 -4 Q-19 -5 -1 2 Q-20 -22 -33 -24 Q-18 -6 0 2 Q12 -30 26 -29 Q16 -9 2 3 Q36 -11 43 2 Q23 -1 3 7" fill="#3ab277"/></g>
            <g transform="translate(166 302)"><ellipse cx="0" cy="52" rx="20" ry="7" fill="#143e39" opacity=".3"/><circle cx="0" cy="11" r="11" fill="#8a5a3b"/><path d="M-11 10 Q-9 -5 3 0 L10 8Z" fill="#14253e"/><rect x="-11" y="23" width="22" height="29" rx="7" fill="#2f6bff"/><path d="M-8 50 L-12 67 M8 50 L13 67" stroke="#f4f7ff" strokeWidth="7" strokeLinecap="round"/><path d="M-9 28 L-19 42 M9 28 L20 39" stroke="#8a5a3b" strokeWidth="6" strokeLinecap="round"/></g>
            <g transform="translate(274 318)"><ellipse cx="0" cy="43" rx="18" ry="6" fill="#143e39" opacity=".3"/><circle cx="0" cy="6" r="9" fill="#c68e66"/><path d="M-9 5 Q-10 -6 0 -6 Q8 -5 9 4Z" fill="#1b2540"/><rect x="-10" y="16" width="20" height="25" rx="7" fill="#e8644a"/><path d="M-7 39 L-10 54 M7 39 L10 54" stroke="#f4f7ff" strokeWidth="6" strokeLinecap="round"/></g>
            <g transform="translate(314 280)"><ellipse cx="0" cy="44" rx="14" ry="5" fill="#143e39" opacity=".3"/><circle cx="0" cy="9" r="8" fill="#5e3b26"/><rect x="-8" y="18" width="16" height="24" rx="6" fill="#ffd166"/><path d="M-6 39 L-8 51 M6 39 L8 51" stroke="#f4f7ff" strokeWidth="5" strokeLinecap="round"/></g>
            <g transform="translate(23 21)"><rect width="132" height="34" rx="12" fill="#0b1530" opacity=".84" stroke="#ffffff" strokeOpacity=".2"/><circle cx="18" cy="17" r="5" fill="#4fb286"/><text x="31" y="21" fill="#f4f7ff" fontSize="10" fontWeight="700">CAMPUS · LIVE WORLD</text></g>
            <g transform="translate(280 343)"><rect width="141" height="42" rx="12" fill="#0b1530" opacity=".88" stroke="#ffffff" strokeOpacity=".2"/><text x="14" y="17" fill="#9fb0d6" fontSize="9" fontWeight="700" letterSpacing="1">NEXT UP</text><text x="14" y="31" fill="#ffd166" fontSize="11" fontWeight="800">CAMPUS WARS  ·  +10 PTS</text></g>
          </svg>
        </div>
      </section>

      <section className="features">
        <p className="tagline">BUILD. PLAY. BELONG.</p>
        <div className="feature-tiles">
          <div className="tile"><span className="ico" aria-hidden="true">🎓</span><b>Campus Life</b><span>Attend classes, meet people, join societies and build your reputation.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">💬</span><b>Social & Community</b><span>Chat with friends, join groups, and keep it safe with block and report.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">🏆</span><b>Campus Wars</b><span>Represent your campus, earn points and win the week. Fair for every campus.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">🛠️</span><b>Create & Build</b><span>Decorate your room and express your style with Campus Coins.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">💼</span><b>Jobs & Economy</b><span>Pick a campus job, work shifts, earn and spend.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">🗺️</span><b>Campus World</b><span>Walk the Commons, Library, Food Hall and Event Arena with other players.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">🎉</span><b>Events & Experiences</b><span>Weekly events, check-ins and shared moments.</span></div>
          <div className="tile"><span className="ico" aria-hidden="true">🏅</span><b>Profile & Progress</b><span>Level up from Fresher to Campus Legend and collect achievements.</span></div>
        </div>
      </section>

      <p className="footer"><Link href="/safety">Safety</Link> · <Link href="/faq">FAQ</Link><br />Campus Coins are an in-game currency with no cash value. CAMPUS is a fictional world.</p>
    </main>
  );
}
