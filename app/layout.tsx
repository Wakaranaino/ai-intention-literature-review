import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Intentions Literature Radar",
  description: "Continuously growing paper radar for AI intentions and alignment faking research.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
