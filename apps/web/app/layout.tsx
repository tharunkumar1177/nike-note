import type { Metadata } from "next";
import { renderTokenCss } from "@quire/ui";

import "./globals.css";

export const metadata: Metadata = {
  title: "Quire",
  description:
    "A block-based workspace for pages, databases, and team collaboration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: renderTokenCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
