import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "புதுமை பெண் AI Navigator",
  description:
    "Zero-barrier Tamil-language assistant guiding rural women to the Pudhumai Penn higher-education scheme.",
  themeColor: "#16a34a",
  manifest: "/manifest.json",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ta">
      <body>{children}</body>
    </html>
  );
}
