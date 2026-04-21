import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Identa | Dental practice management for private dentists and small clinics",
    template: "%s | Identa",
  },
  description:
    "Identa helps private dentists and small clinics manage appointments, patient records, treatment history, and payments in one clear system.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://identa.uz"),
  applicationName: "Identa",
  keywords: [
    "dental practice management",
    "dental clinic software",
    "appointment management",
    "patient records",
    "payment tracking",
    "dentist software",
    "clinic management",
    "Identa",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://identa.uz",
    siteName: "Identa",
    title: "Identa | Dental practice management for private dentists and small clinics",
    description:
      "Manage appointments, patient records, treatment history, and payments in one clear system.",
    images: [
      {
        url: "/brand/identa-full-logo.png",
        width: 580,
        height: 680,
        alt: "Identa logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Identa | Dental practice management for private dentists and small clinics",
    description:
      "Manage appointments, patient records, treatment history, and payments in one clear system.",
    images: ["/brand/identa-full-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: "/brand/identa-icon-only.png",
    shortcut: "/brand/identa-icon-only.png",
    apple: "/brand/identa-icon-only.png",
  },
  category: "healthcare",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <QueryProvider>
          <I18nProvider initialLocale={locale}>
            {children}
            <Toaster />
            <Analytics />
            <SpeedInsights />
          </I18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
