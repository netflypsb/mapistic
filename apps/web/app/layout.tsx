import type { Metadata } from "next";
import "./globals.css";
import AccountButton from "@/components/account-button";

export const metadata: Metadata = {
  title: "Mapistic — Malaysia, Singapore & Brunei Maps & Navigation | Dawnistic",
  description:
    "Fast, mobile-first web map, turn-by-turn navigation (Car, Motorbike, Bicycle, Walk), and live Malaysian public transport (RapidKL, KTMB, BAS.MY) by Dawnistic.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-lg.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased selection:bg-[#d97706]/20 selection:text-[#1c1917]">
        {/* Canonical Dawnistic account button (login → hub sign-in, logged-in
            menu = Home/Dashboard/Credits/Change name/Logout), fixed top-right
            on every page. */}
        <div
          className="acct-fixed"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          {process.env.NEXT_PUBLIC_HUB_URL ? <AccountButton signOutRedirect="/" /> : null}
        </div>
        {children}
      </body>
    </html>
  );
}