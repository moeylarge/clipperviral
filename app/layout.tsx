import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Scissors, Subtitles, WandSparkles } from "lucide-react";
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
  { href: "/shows/kick-template", label: "Kick Template", icon: Scissors },
  { href: "/shows/caption-studio", label: "Caption Studio", icon: Subtitles },
  { href: "/shows/youtube-ai-clips", label: "YouTube AI Clips", icon: WandSparkles },
];

export const metadata: Metadata = {
  title: "ClipperViral Dashboard",
  description: "Workflow dashboard for Kick templates, caption generation, and YouTube AI clips.",
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
