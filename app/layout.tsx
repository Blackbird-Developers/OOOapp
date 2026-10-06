import type { Metadata } from "next";
// Self-hosted from npm rather than next/font/google. next/font downloads the
// font from Google during every build, and when Google answered Vercel with a
// font URL it didn't recognise, production builds failed outright. These ship
// the same variable fonts inside the build, so nothing is fetched at all.
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackbird Leave",
  description: "Blackbird Marketing leave tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased text-brand-ink">
        {children}
      </body>
    </html>
  );
}
