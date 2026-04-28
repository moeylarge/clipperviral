import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";

import { FwtovAuthProvider } from "./_components/fwtov-auth-provider";
import { FwtovWalletProvider } from "./_components/fwtov-wallet-provider";
import "./globals.css";

const heading = Fredoka({
  variable: "--font-heading",
  subsets: ["latin"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Magic Call",
  description: "Live magical video calls with Santa Claus, the Tooth Fairy, and the Easter Bunny. Parent-started. First 45 seconds included.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} min-h-screen bg-background text-foreground antialiased`}>
        <FwtovAuthProvider>
          <FwtovWalletProvider>{children}</FwtovWalletProvider>
        </FwtovAuthProvider>
      </body>
    </html>
  );
}
