import type { Metadata } from "next";
import "./globals.css";
import { ClientRuntime } from "@/components/providers/client-runtime";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_SIZE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo/site";

const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.identa.uz/api").origin;

export const metadata: Metadata = {
  title: {
    default: "Identa | Dental practice management for private dentists and small clinics",
    template: "%s | Identa",
  },
  description:
    "Identa helps private dentists and small clinics manage appointments, patient records, treatment history, and payments in one clear system.",
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
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
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Identa | Dental practice management for private dentists and small clinics",
    description:
      "Manage appointments, patient records, treatment history, and payments in one clear system.",
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        ...SOCIAL_IMAGE_SIZE,
        alt: SOCIAL_IMAGE_ALT,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Identa | Dental practice management for private dentists and small clinics",
    description:
      "Manage appointments, patient records, treatment history, and payments in one clear system.",
    images: [{ url: SOCIAL_IMAGE_PATH, alt: SOCIAL_IMAGE_ALT }],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <head>
        <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={apiOrigin} />
      </head>
      <body>
        {children}
        <ClientRuntime />
      </body>
    </html>
  );
}
