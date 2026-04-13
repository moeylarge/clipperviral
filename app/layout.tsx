import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, LayoutGrid, Scissors, Subtitles, WandSparkles } from "lucide-react";
import { Inter, Sora } from "next/font/google";

import { SiteHeader } from "@/components/shell/site-header";

import "./globals.css";

const heading = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/editor.html", label: "Unified Editor", icon: Clapperboard },
  { href: "/shows/youtube-ai-clips", label: "URL Clips", icon: WandSparkles },
  { href: "/shows/caption-studio", label: "Captions", icon: Subtitles },
  { href: "/shows/kick-template", label: "Kick Fallback", icon: Scissors },
];

export const metadata: Metadata = {
  title: "ClipperViral Dashboard",
  description: "Unified editor dashboard for uploads, YouTube AI clips, captions, layouts, and exports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} min-h-screen bg-background text-foreground antialiased`}>
        <div className="app-shell">
          <aside className="app-sidebar">
            <div className="sidebar-brand">
              <div className="sidebar-brand-badge">CV</div>
              <div>
                <p className="sidebar-brand-title">ClipperViral</p>
                <p className="sidebar-brand-subtitle">Creator Clip Suite</p>
              </div>
            </div>
            <nav className="sidebar-nav">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href} className="sidebar-link">
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="app-main">
            <SiteHeader />
            <main className="app-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
