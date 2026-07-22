import type { Metadata } from "next";
import { VT323 } from "next/font/google";
import "@/styles/globals.css";

const vt323 = VT323({
  weight: "400",
  variable: "--font-vt323",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Game Development Tools & Resources Knowledge Bank",
  description:
    "A curated, searchable catalog of game development tools and how they relate to each other.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${vt323.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
