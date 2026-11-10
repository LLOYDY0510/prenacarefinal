import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";

const bodyFont = localFont({ src: "./fonts/noto-sans-latin.woff2", variable: "--font-body", weight: "400 700", display: "swap", fallback: ["Arial"] });
const headingFont = localFont({ src: "./fonts/figtree-latin.woff2", variable: "--font-heading", weight: "400 700", display: "swap", fallback: ["Arial"] });

export const metadata: Metadata = {
  title: "Prenatrack — Barangay Maternal Health Tracking",
  description:
    "Register, monitor, and follow up on pregnant mothers across your barangay's puroks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
