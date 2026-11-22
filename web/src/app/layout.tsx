import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Noto_Sans_Bengali } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const bengali = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  variable: "--font-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NightSafe · Precision Safety System",
  description: "Tactical telemetry, real-time vital monitoring, and rapid emergency intervention.",
  appleWebApp: { capable: true, title: "NightSafe", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#141b09",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${bengali.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-surface-container-low font-body text-on-surface antialiased selection:bg-secondary-container selection:text-on-secondary-container">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
