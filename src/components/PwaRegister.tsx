"use client";

import { useEffect } from "react";

/** Service worker kaydı — PWA "ana ekrana ekle" için. */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW desteklenmiyorsa uygulama normal çalışır */
      });
    }
  }, []);
  return null;
}
