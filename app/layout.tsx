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
  title: "Identa - Practice Management",
  description: "Solo dentist practice management system",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://identa.uz"),
  alternates: {
    canonical: "/",
  },
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
