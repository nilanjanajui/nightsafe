import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

// Alert transcripts are Bangla; this guarantees correct rendering on every device.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali", "latin"], variable: "--font-bengali", display: "swap" });

export const metadata: Metadata = {
  title: "NightSafe",
  description: "Personal safety device dashboard",
  appleWebApp: { capable: true, title: "NightSafe", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#0f172a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bengali.variable}>
      <body className="min-h-dvh antialiased">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}