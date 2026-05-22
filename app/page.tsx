import type { Metadata } from "next";

const siteUrl = "https://identa.uz";
const seoTitle = "Identa — стоматологическая CRM для клиник и частных стоматологов";
const seoDescription =
    "Identa объединяет пациентов, приёмы, оплаты, сотрудников, клинические снимки и мобильный доступ в одном рабочем кабинете для стоматологов.";

export const metadata: Metadata = {
    title: seoTitle,
    description: seoDescription,
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

export default function LandingPage() {
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Identa",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
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

    return (
        <main className="fixed inset-0 overflow-hidden bg-white">
            <iframe
                src="/identa-handoff/Identa%20Landing.html"
                title="Identa Landing"
                className="h-full w-full border-0"
            />
            <section className="sr-only" aria-label="Identa landing overview">
                <h1>Identa — стоматологическая CRM для клиник и частных стоматологов</h1>
                <p>
                    Identa помогает вести пациентов, приёмы, оплаты, сотрудников,
                    историю лечения и клинические снимки в одном рабочем кабинете.
                </p>
                <h2>Возможности Identa</h2>
                <ul>
                    <li>Карточки пациентов, история лечения и заметки.</li>
                    <li>Расписание приёмов без пересечений и путаницы со статусами.</li>
                    <li>Оплаты, счета и история платежей, связанные с пациентами.</li>
                    <li>Клинические снимки с приватным доступом и тарифными лимитами.</li>
                    <li>Права доступа для сотрудников: пациенты, приёмы и оплаты.</li>
                    <li>Мобильное приложение с синхронизацией web-кабинета.</li>
                </ul>
                <h2>Для кого подходит</h2>
                <p>
                    Сервис подходит частным стоматологам, небольшим стоматологическим
                    кабинетам и клиникам, которым нужен простой рабочий инструмент без
                    лишней сложности.
                </p>
            </section>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
        </main>
    );
}
