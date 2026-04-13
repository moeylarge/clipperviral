import type { Metadata } from "next";
import { Bebas_Neue, Manrope } from "next/font/google";

import { SiteHeader } from "@/components/shell/site-header";

import "./globals.css";

const heading = Bebas_Neue({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClipperViral | Clip Dashboard",
  description:
    "ClipperViral dashboard for Kick templates, caption generation, and YouTube AI clip workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${heading.variable} ${body.variable} min-h-screen bg-background text-foreground antialiased`}>
        <div className="relative min-h-screen overflow-x-clip bg-spotlight-radial">
          <SiteHeader />
          <main className="spotlight-shell mx-auto w-full px-5 py-8 md:px-8 md:py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
