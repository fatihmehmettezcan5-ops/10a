import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "10/A Sınıf Paneli",
  description:
    "Ödev takibi, sınıf ve kişisel hatırlatıcı takvimi, ders programı, sınıf sohbeti ve yapay zekâ ödev asistanı.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="text-slate-100 antialiased">{children}</body>
    </html>
  );
}
