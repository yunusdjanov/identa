import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Landing } from "@/components/landing/landing";
import { getLandingPlans } from "@/lib/landing/plans";
import { LANDING_CONTENT, DEFAULT_LANDING_LOCALE } from "@/lib/landing/content";
import "./landing.css";

const siteUrl = "https://identa.uz";
const seoTitle = "Identa — стоматологическая CRM для клиник и частных стоматологов";
const seoDescription =
    "Identa объединяет пациентов, приёмы, оплаты, сотрудников, клинические снимки и мобильный доступ в одном рабочем кабинете для стоматологов. 30 дней бесплатного доступа после регистрации.";

// Self-hosted via next/font (no render-blocking Google Fonts request, no
// layout shift). The variables feed the landing's --font-sans/display/mono.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrumentSerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-instrument",
    display: "swap",
});

export const metadata: Metadata = {
    title: seoTitle,
    description: seoDescription,
    keywords: [
        "стоматологическая CRM",
        "CRM для стоматологии",
        "программа для стоматолога",
        "учёт пациентов стоматология",
        "одонтограмма онлайн",
        "Identa",
    ],
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: seoTitle,
        description: seoDescription,
        url: "/",
        siteName: "Identa",
        type: "website",
        locale: "ru_UZ",
        images: [
            {
                url: "/brand/identa-full-logo.png",
                width: 580,
                height: 680,
                alt: "Identa",
            },
        ],
    },
    twitter: {
        card: "summary",
        title: seoTitle,
        description: seoDescription,
        images: ["/brand/identa-full-logo.png"],
    },
};

const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Identa",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android",
    url: siteUrl,
    description: seoDescription,
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "UZS",
        description: "30 дней бесплатного пробного доступа после регистрации.",
    },
    audience: {
        "@type": "Audience",
        audienceType: "Стоматологи, частные клиники и небольшие стоматологические команды",
    },
    featureList: [
        "Управление пациентами",
        "Расписание приёмов",
        "Учёт оплат",
        "Клинические снимки",
        "Права доступа сотрудников",
        "Синхронизация web-кабинета и мобильного приложения",
    ],
    publisher: {
        "@type": "Organization",
        name: "Identa",
        url: siteUrl,
        logo: `${siteUrl}/brand/identa-full-logo.png`,
    },
};

// FAQ rich-result schema, built from the same FAQ copy the page renders. The
// server pre-renders (and crawlers index) the default locale, so the schema
// mirrors that locale's questions/answers to stay in sync with the visible text.
const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_CONTENT[DEFAULT_LANDING_LOCALE].faq.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
        },
    })),
};

export default async function LandingPage() {
    const fontClassName = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;
    // Pricing limits come from the DB (public plans endpoint) at render time so
    // the landing never drifts from /admin/plans. Falls back to seeded defaults
    // if the API is unreachable.
    const plans = await getLandingPlans();

    return (
        <>
            <Landing fontClassName={fontClassName} plans={plans} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
            />
        </>
    );
}
