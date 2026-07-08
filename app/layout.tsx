import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { ClientRuntime } from "@/components/providers/client-runtime";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";

const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.identa.uz/api").origin;

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
    icon: [
      { url: "/icon.png?v=20260709", type: "image/png", sizes: "256x256" },
      { url: "/favicon.ico?v=20260709", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=20260709",
    apple: "/icon.png?v=20260709",
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
      <head>
        <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={apiOrigin} />
      </head>
      <body>
        <I18nProvider initialLocale={locale} initialDictionary={DICTIONARIES[locale]}>
          {children}
          <ClientRuntime />
        </I18nProvider>
      </body>
    </html>
  );
}
