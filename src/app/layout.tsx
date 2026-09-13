import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "10/A Sınıf Paneli",
  description:
    "Ödev takibi, sınıf ve kişisel hatırlatıcı takvimi, ders programı, sınıf sohbeti ve yapay zekâ ödev asistanı.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "10/A Panel", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="text-slate-100 antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
