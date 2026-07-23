import type { Metadata } from "next";
import { VT323 } from "next/font/google";
import "@/styles/globals.css";
import Topbar from "@/components/ui/Topbar";

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
      <body className="min-h-full">
        <div className="mx-auto flex min-h-full max-w-[1180px] flex-col border-line md:border-x">
          <Topbar />
          <main className="flex flex-1 flex-col p-4">{children}</main>
          <footer className="border-t border-line px-4 py-4 text-center text-[14px] text-dim">
            Phosphor · GDTRKB
          </footer>
        </div>
      </body>
    </html>
  );
}
