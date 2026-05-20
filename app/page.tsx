import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Identa — рабочий кабинет для стоматологов",
    description:
        "Identa помогает стоматологам вести пациентов, приёмы, оплаты, сотрудников и клинические снимки в одном рабочем кабинете. 30 дней бесплатного доступа после регистрации.",
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "Identa — рабочий кабинет для стоматологов",
        description:
            "Пациенты, приёмы, оплаты, сотрудники и клинические снимки в одном рабочем кабинете для стоматологов.",
        url: "/",
        siteName: "Identa",
        type: "website",
    },
};

export default function LandingPage() {
    return (
        <main className="fixed inset-0 overflow-hidden bg-white">
            <iframe
                src="/identa-handoff/Identa%20Landing.html"
                title="Identa Landing"
                className="h-full w-full border-0"
            />
        </main>
    );
}
