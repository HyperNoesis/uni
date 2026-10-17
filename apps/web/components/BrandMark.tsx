/** CAMPUS brand: the Grand Gate abstracted (slab over two piers, gold road running through). Wordmark is drawn as paths so it never depends on a font; the A is a bar-less chevron. */
export function GateMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs><linearGradient id="gm-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16295a" /><stop offset="1" stopColor="#0a1330" /></linearGradient><linearGradient id="gm-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe3a0" /><stop offset="1" stopColor="#d6a84a" /></linearGradient></defs>
      <rect width="512" height="512" rx="112" fill="url(#gm-b)" /><rect x="92" y="130" width="328" height="52" rx="6" fill="#f2efe6" /><rect x="118" y="182" width="64" height="210" fill="#e6dfce" /><rect x="330" y="182" width="64" height="210" fill="#e6dfce" /><path d="M214 182H298L350 392H162Z" fill="url(#gm-r)" /><rect x="92" y="130" width="328" height="10" fill="#2f6bff" />
    </svg>
  );
}
export function Wordmark({ height = 18 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 600 100" role="img" aria-label="CAMPUS" fill="none" stroke="currentColor" strokeWidth="13" strokeLinejoin="miter">
      <path d="M86 24A40 40 0 1 0 86 76" /><path d="M118 100L158 6L198 100" /><path d="M236 100V6L286 66L336 6V100" /><path d="M374 100V6H414A24 24 0 0 1 414 54H374" /><path d="M452 6V62A30 32 0 0 0 512 62V6" /><path d="M590 22C580 10 566 6 552 6C534 6 524 15 524 27C524 44 546 46 558 50C574 55 586 58 586 74C586 90 572 94 554 94C538 94 526 90 518 80" strokeLinejoin="round" strokeLinecap="butt" />
    </svg>
  );
}
export function BrandLockup({ size = 34 }: { size?: number }) {
  return <span className="brand-lockup" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><GateMark size={size} /><Wordmark height={Math.round(size * 0.46)} /></span>;
}
