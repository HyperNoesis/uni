import type { Metadata, Viewport } from "next";
import "./tokens.css";
import "./globals.css";
import "./phase1.css";
import "./phase2.css";
import "./phase5.css";
import "./phase6.css";
import "./phone.css";
import { PwaRegister } from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "CAMPUS — Your life. Your campus. Your world.",
  description: "A browser-first campus life world. Build your identity, find your people, represent your campus.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2f6bff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
