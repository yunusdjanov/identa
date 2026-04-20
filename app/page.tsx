'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    CreditCard,
    MessageCircle,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { createPublicLeadRequest, getPublicLandingSettings } from '@/lib/api/dentist';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getPhoneValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';
import type { ApiLandingSettings } from '@/lib/api/types';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://identa.uz';
const TELEGRAM_CONTACT_URL = process.env.NEXT_PUBLIC_TELEGRAM_CONTACT_URL?.trim();

type LandingLocale = 'ru' | 'uz' | 'en';
type PlanKey = 'trial' | 'monthly' | 'yearly';

interface LandingFormState {
    name: string;
    phone: string;
    clinicName: string;
    city: string;
    note: string;
}

interface PlanContent {
    key: PlanKey;
    title: string;
    badge: string;
    description: string;
    periodLabel: string | null;
    priceHint: string;
    bullets: string[];
}

interface LandingContent {
    nav: {
        benefits: string;
        plans: string;
        faq: string;
        request: string;
        signIn: string;
    };
    hero: {
        badge: string;
        title: string;
        description: string;
        primary: string;
        secondary: string;
        helper: string;
        previewTitle: string;
        previewSummary: string;
        previewItems: Array<{ label: string; value: string }>;
    };
    benefits: {
        eyebrow: string;
        title: string;
        items: Array<{ title: string; description: string }>;
    };
    plans: {
        eyebrow: string;
        title: string;
        description: string;
        freePrice: string;
        items: PlanContent[];
    };
    request: {
        title: string;
        description: string;
        panelTitle: string;
        panelItems: string[];
        name: string;
        phone: string;
        clinic: string;
        city: string;
        note: string;
        optional: string;
        submit: string;
        submitting: string;
        submitted: string;
        submitError: string;
        fixErrors: string;
        directTelegram: string;
        telegramPrompt: string;
    };
    faq: {
        eyebrow: string;
        title: string;
        items: Array<{ question: string; answer: string }>;
    };
    finalCta: {
        title: string;
        description: string;
        primary: string;
        secondary: string;
    };
    footer: string;
}

const DEFAULT_LANDING_SETTINGS: ApiLandingSettings = {
    trial_price_amount: 0,
    monthly_price_amount: 450000,
    yearly_price_amount: 4500000,
    currency: 'UZS',
    telegram_contact_url: null,
};

const LANDING_CONTENT: Record<LandingLocale, LandingContent> = {
    uz: {
        nav: {
            benefits: 'Afzalliklar',
            plans: 'Tariflar',
            faq: 'Savollar',
            request: "So'rov",
            signIn: 'Kirish',
        },
        hero: {
            badge: 'Xususiy stomatolog va kichik klinikalar uchun',
            title: "Qabullar, bemorlar va to'lovlarni bitta tizimda boshqaring",
            description:
                'Identa kundalik ishni soddalashtiradi: jadval, bemor kartasi, davolash tarixi va qarzdorlik nazorati bir joyda ishlaydi.',
            primary: "So'rov qoldirish",
            secondary: 'Kirish',
            helper: "Ulanish so'rov orqali ochiladi. Demo va onboarding bosqichma-bosqich ko'rsatib beriladi.",
            previewTitle: 'Ichkarida nima bor',
            previewSummary: "Klinikaning eng ko'p ishlatiladigan ish oqimlari bitta oynada ko'rinadi.",
            previewItems: [
                { label: 'Qabullar', value: 'Kunlik va haftalik jadval' },
                { label: 'Bemorlar', value: 'Kartalar va tarix' },
                { label: "To'lovlar", value: 'Qarz va tushum nazorati' },
            ],
        },
        benefits: {
            eyebrow: 'Nima uchun Identa',
            title: 'Klinikaga eng kerakli narsalar',
            items: [
                {
                    title: 'Qabul jadvali tartibli',
                    description: "Kunlik va haftalik jadvalni chalkashliksiz boshqarasiz.",
                },
                {
                    title: 'Bemor kartalari bir joyda',
                    description: 'Tarix, odontogramma, yozuvlar va rasmlar tartib bilan saqlanadi.',
                },
                {
                    title: "To'lov nazorati oson",
                    description: "Kim qancha to'lagani va qancha qolganini tez ko'rasiz.",
                },
                {
                    title: 'Har qurilmada qulay',
                    description: 'Telefon, planshet va kompyuterda ishlash uchun moslangan.',
                },
            ],
        },
        plans: {
            eyebrow: 'Tariflar',
            title: 'Klinikangizga mos 3 tarif',
            description: "Farq aniq: qancha muddatga va nechta assistent bilan ishlashingizga qarab tanlaysiz.",
            freePrice: 'Bepul',
            items: [
                {
                    key: 'trial',
                    title: 'Sinov muddati',
                    badge: '30 kun',
                    description: "Tizimni amalda ko'rib chiqish uchun boshlang'ich variant.",
                    periodLabel: null,
                    priceHint: '1 ta assistentgacha',
                    bullets: [
                        'Asosiy modullar ochiq',
                        'Tez onboarding',
                        'Boshlash uchun qulay',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Oylik tarif',
                    badge: 'Oylik',
                    description: 'Faol ishlayotgan xususiy amaliyot uchun mos variant.',
                    periodLabel: '/ oy',
                    priceHint: '3 ta assistentgacha',
                    bullets: [
                        'To‘liq ishchi kirish',
                        "Qabullar, bemorlar va to'lovlar",
                        'Har oy uzaytirish mumkin',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Yillik tarif',
                    badge: 'Yillik',
                    description: 'Barqaror klinikalar uchun uzoqroq muddatli format.',
                    periodLabel: '/ yil',
                    priceHint: '5 ta assistentgacha',
                    bullets: [
                        'To‘liq ishchi kirish',
                        'Uzoq muddatli foydalanish',
                        'Yiliga bir marta uzaytiriladi',
                    ],
                },
            ],
        },
        request: {
            title: "Demo yoki ulanish uchun so'rov qoldiring",
            description: "Forma orqali so'rov yuborasiz yoki xohlasangiz darrov Telegram orqali yozasiz.",
            panelTitle: 'Qanday davom etadi',
            panelItems: [
                "So'rovni olamiz va siz bilan bog'lanamiz",
                "Qisqa demo ko'rsatamiz va mos tarifni aniqlaymiz",
                'Access ochib, ishga tushirishga yordam beramiz',
            ],
            name: 'Ism',
            phone: 'Telefon',
            clinic: 'Klinika nomi',
            city: 'Shahar',
            note: 'Izoh',
            optional: 'ixtiyoriy',
            submit: "So'rov yuborish",
            submitting: 'Yuborilmoqda...',
            submitted: "So'rov yuborildi. Tez orada bog'lanamiz.",
            submitError: "So'rovni yuborib bo'lmadi. Qayta urinib ko'ring.",
            fixErrors: "Majburiy maydonlarni to'g'rilang.",
            directTelegram: 'Telegram orqali bog‘lanish',
            telegramPrompt: 'Identa haqida ma’lumot olmoqchiman',
        },
        faq: {
            eyebrow: 'Savollar',
            title: 'Qisqa va aniq javoblar',
            items: [
                {
                    question: 'Tizimga qanday ulanaman?',
                    answer: "Saytdan so'rov qoldirasiz yoki Telegram orqali yozasiz. Keyin demo ko'rsatib, access ochamiz.",
                },
                {
                    question: 'Sinov muddati bormi?',
                    answer: "Ha. Bepul sinov muddati orqali tizimni real ish jarayonida ko'rib chiqishingiz mumkin.",
                },
                {
                    question: 'Telefonda ishlaydimi?',
                    answer: 'Ha. Tizim telefon, planshet va kompyuter uchun moslashtirilgan.',
                },
                {
                    question: 'Kimlar uchun mos?',
                    answer: 'Xususiy stomatologlar va kichik klinikalar uchun, ayniqsa kundalik ishni tartibga solish kerak bo‘lsa.',
                },
            ],
        },
        finalCta: {
            title: 'Klinikangizni tartibli boshqarishga tayyormisiz?',
            description: "So'rov qoldiring yoki mavjud akkaunt bilan tizimga kiring.",
            primary: "So'rov yuborish",
            secondary: 'Kirish',
        },
        footer: '(c) 2026 Identa. O‘zbekistondagi xususiy stomatologlar uchun.',
    },
    ru: {
        nav: {
            benefits: 'Преимущества',
            plans: 'Тарифы',
            faq: 'Вопросы',
            request: 'Заявка',
            signIn: 'Войти',
        },
        hero: {
            badge: 'Для частных стоматологов и небольших клиник',
            title: 'Управляйте записями, пациентами и оплатами в одной системе',
            description:
                'Identa упрощает ежедневную работу: расписание, карточки пациентов, история лечения и контроль долгов собраны в одном месте.',
            primary: 'Оставить заявку',
            secondary: 'Войти',
            helper: 'Доступ открывается по запросу. Показываем демо и помогаем спокойно запуститься.',
            previewTitle: 'Что внутри системы',
            previewSummary: 'Самые важные рабочие процессы клиники видны без лишних переходов.',
            previewItems: [
                { label: 'Записи', value: 'Дневной и недельный календарь' },
                { label: 'Пациенты', value: 'Карточки и история лечения' },
                { label: 'Оплаты', value: 'Контроль долгов и поступлений' },
            ],
        },
        benefits: {
            eyebrow: 'Почему Identa',
            title: 'Самое важное для ежедневной работы',
            items: [
                {
                    title: 'Расписание под контролем',
                    description: 'Удобно вести записи на день и неделю без путаницы.',
                },
                {
                    title: 'Карточки пациентов в порядке',
                    description: 'История, одонтограмма, заметки и изображения хранятся рядом.',
                },
                {
                    title: 'Оплаты видны сразу',
                    description: 'Сразу понятно, что оплачено и что ещё осталось закрыть.',
                },
                {
                    title: 'Удобно на любом устройстве',
                    description: 'Система адаптирована для телефона, планшета и компьютера.',
                },
            ],
        },
        plans: {
            eyebrow: 'Тарифы',
            title: 'Три понятных варианта',
            description: 'Разница прозрачна: срок работы и количество ассистентов видны сразу.',
            freePrice: 'Бесплатно',
            items: [
                {
                    key: 'trial',
                    title: 'Пробный период',
                    badge: '30 дней',
                    description: 'Для первого знакомства с системой на реальных задачах клиники.',
                    periodLabel: null,
                    priceHint: 'До 1 ассистента',
                    bullets: [
                        'Открыты основные модули',
                        'Быстрый запуск',
                        'Удобно для первичной проверки',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Месячный тариф',
                    badge: 'Помесячно',
                    description: 'Подходит для частной практики с активной ежедневной работой.',
                    periodLabel: '/ месяц',
                    priceHint: 'До 3 ассистентов',
                    bullets: [
                        'Полный рабочий доступ',
                        'Записи, пациенты и оплаты',
                        'Можно продлевать каждый месяц',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Годовой тариф',
                    badge: 'На год',
                    description: 'Хороший вариант для стабильной клиники на длинный срок.',
                    periodLabel: '/ год',
                    priceHint: 'До 5 ассистентов',
                    bullets: [
                        'Полный рабочий доступ',
                        'Долгий период использования',
                        'Продление один раз в год',
                    ],
                },
            ],
        },
        request: {
            title: 'Оставьте заявку на демо или подключение',
            description: 'Можно отправить форму на сайте или сразу написать нам в Telegram.',
            panelTitle: 'Что будет дальше',
            panelItems: [
                'Получаем заявку и быстро связываемся',
                'Показываем короткое демо и помогаем выбрать тариф',
                'Открываем доступ и сопровождаем старт',
            ],
            name: 'Имя',
            phone: 'Телефон',
            clinic: 'Название клиники',
            city: 'Город',
            note: 'Комментарий',
            optional: 'необязательно',
            submit: 'Отправить заявку',
            submitting: 'Отправка...',
            submitted: 'Заявка отправлена. Мы скоро свяжемся с вами.',
            submitError: 'Не удалось отправить заявку. Попробуйте ещё раз.',
            fixErrors: 'Проверьте обязательные поля.',
            directTelegram: 'Связаться в Telegram',
            telegramPrompt: 'Хочу узнать подробнее об Identa',
        },
        faq: {
            eyebrow: 'Вопросы',
            title: 'Коротко о главном',
            items: [
                {
                    question: 'Как получить доступ к системе?',
                    answer: 'Оставляете заявку на сайте или пишете в Telegram. После короткого общения и демо открываем доступ.',
                },
                {
                    question: 'Есть ли пробный период?',
                    answer: 'Да. Можно начать с бесплатного пробного периода и проверить систему в реальной работе клиники.',
                },
                {
                    question: 'Работает ли система на телефоне?',
                    answer: 'Да. Интерфейс адаптирован для телефона, планшета и компьютера.',
                },
                {
                    question: 'Для кого подходит Identa?',
                    answer: 'Для частных стоматологов и небольших клиник, которым нужен порядок в записях, пациентах и оплатах.',
                },
            ],
        },
        finalCta: {
            title: 'Готовы навести порядок в клинике?',
            description: 'Оставьте заявку или войдите, если у вас уже есть доступ.',
            primary: 'Оставить заявку',
            secondary: 'Войти',
        },
        footer: '(c) 2026 Identa. Для частных стоматологов и небольших клиник.',
    },
    en: {
        nav: {
            benefits: 'Benefits',
            plans: 'Plans',
            faq: 'FAQ',
            request: 'Request',
            signIn: 'Sign in',
        },
        hero: {
            badge: 'Built for private dentists and small clinics',
            title: 'Manage appointments, patients, and payments in one clear system',
            description:
                'Identa keeps the daily workflow simple: scheduling, patient records, treatment history, and payment control are handled in one place.',
            primary: 'Request access',
            secondary: 'Sign in',
            helper: 'Access is issued on request. We show the demo and help you get started step by step.',
            previewTitle: 'What you get inside',
            previewSummary: 'The most important clinic workflows stay visible without extra clutter.',
            previewItems: [
                { label: 'Appointments', value: 'Daily and weekly calendar' },
                { label: 'Patients', value: 'Records and treatment history' },
                { label: 'Payments', value: 'Debt and revenue tracking' },
            ],
        },
        benefits: {
            eyebrow: 'Why Identa',
            title: 'What matters most for daily work',
            items: [
                {
                    title: 'Scheduling stays clear',
                    description: 'Manage daily and weekly appointments without confusion.',
                },
                {
                    title: 'Patient records stay together',
                    description: 'History, odontogram, notes, and images stay in one place.',
                },
                {
                    title: 'Payments stay visible',
                    description: 'Quickly see what was paid and what is still pending.',
                },
                {
                    title: 'Comfortable on every device',
                    description: 'Optimized for phone, tablet, and desktop use.',
                },
            ],
        },
        plans: {
            eyebrow: 'Plans',
            title: 'Three clear pricing options',
            description: 'The difference is simple: duration and assistant limits are shown right away.',
            freePrice: 'Free',
            items: [
                {
                    key: 'trial',
                    title: 'Trial period',
                    badge: '30 days',
                    description: 'A practical starting point for testing the system in a real clinic workflow.',
                    periodLabel: null,
                    priceHint: 'Up to 1 assistant',
                    bullets: [
                        'Core modules included',
                        'Fast onboarding',
                        'Great for first evaluation',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Monthly plan',
                    badge: 'Monthly',
                    description: 'Best for active private practice with ongoing daily work.',
                    periodLabel: '/ month',
                    priceHint: 'Up to 3 assistants',
                    bullets: [
                        'Full working access',
                        'Appointments, patients, and payments',
                        'Can be renewed every month',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Yearly plan',
                    badge: 'Yearly',
                    description: 'A long-term option for stable clinics.',
                    periodLabel: '/ year',
                    priceHint: 'Up to 5 assistants',
                    bullets: [
                        'Full working access',
                        'Longer usage period',
                        'Renewed once per year',
                    ],
                },
            ],
        },
        request: {
            title: 'Request a demo or clinic access',
            description: 'Send the form on the site or contact us directly in Telegram.',
            panelTitle: 'What happens next',
            panelItems: [
                'We receive the request and reply quickly',
                'We show a short demo and help choose the right plan',
                'We open access and support your launch',
            ],
            name: 'Name',
            phone: 'Phone',
            clinic: 'Clinic name',
            city: 'City',
            note: 'Comment',
            optional: 'optional',
            submit: 'Send request',
            submitting: 'Sending...',
            submitted: 'Request sent. We will contact you shortly.',
            submitError: 'Could not send the request. Please try again.',
            fixErrors: 'Please review the required fields.',
            directTelegram: 'Contact on Telegram',
            telegramPrompt: 'I want to learn more about Identa',
        },
        faq: {
            eyebrow: 'FAQ',
            title: 'Short answers to the main questions',
            items: [
                {
                    question: 'How do I get access?',
                    answer: 'Leave a request on the site or contact us in Telegram. After a short intro and demo, we open access.',
                },
                {
                    question: 'Is there a trial period?',
                    answer: 'Yes. You can start with a free trial period and check the system in a real clinic workflow.',
                },
                {
                    question: 'Does it work on mobile?',
                    answer: 'Yes. The interface is adapted for phone, tablet, and desktop use.',
                },
                {
                    question: 'Who is Identa built for?',
                    answer: 'Private dentists and small clinics that need a cleaner daily workflow for appointments, patients, and payments.',
                },
            ],
        },
        finalCta: {
            title: 'Ready to organize your clinic better?',
            description: 'Send a request or sign in if you already have access.',
            primary: 'Send request',
            secondary: 'Sign in',
        },
        footer: '(c) 2026 Identa. Built for private dentists and small clinics.',
    },
};

const BENEFIT_ICONS = [CalendarDays, Stethoscope, CreditCard, Smartphone] as const;

function getIntlLocale(locale: LandingLocale): string {
    switch (locale) {
        case 'uz':
            return 'uz-UZ';
        case 'ru':
            return 'ru-RU';
        default:
            return 'en-US';
    }
}

function getPlanAmount(settings: ApiLandingSettings, planKey: PlanKey): number {
    switch (planKey) {
        case 'trial':
            return settings.trial_price_amount;
        case 'monthly':
            return settings.monthly_price_amount;
        case 'yearly':
            return settings.yearly_price_amount;
    }
}

function formatPrice(amount: number, currency: string, locale: LandingLocale): string {
    try {
        return new Intl.NumberFormat(getIntlLocale(locale), {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${amount.toLocaleString(getIntlLocale(locale))} ${currency}`;
    }
}

function buildTelegramHref(message: string, contactUrl?: string | null): string {
    const configuredUrl = contactUrl?.trim() || TELEGRAM_CONTACT_URL;

    if (configuredUrl) {
        try {
            const directUrl = new URL(configuredUrl);

            if (message.trim() !== '') {
                directUrl.searchParams.set('text', message);
            }

            return directUrl.toString();
        } catch {
            // Fallback to share URL below.
        }
    }

    const shareUrl = new URL('https://t.me/share/url');
    shareUrl.searchParams.set('url', SITE_URL);
    shareUrl.searchParams.set('text', message);
    return shareUrl.toString();
}

export default function LandingPage() {
    const { locale } = useI18n();
    const landingLocale = (locale as LandingLocale) ?? 'en';
    const content = LANDING_CONTENT[landingLocale] ?? LANDING_CONTENT.en;
    const [form, setForm] = useState<LandingFormState>({
        name: '',
        phone: '',
        clinicName: '',
        city: '',
        note: '',
    });
    const [isSubmitted, setIsSubmitted] = useState(false);

    const landingSettingsQuery = useQuery({
        queryKey: ['public', 'landing-settings'],
        queryFn: getPublicLandingSettings,
        staleTime: 60_000,
    });

    const leadRequestMutation = useMutation({
        mutationFn: createPublicLeadRequest,
        onSuccess: () => {
            setForm({
                name: '',
                phone: '',
                clinicName: '',
                city: '',
                note: '',
            });
            setIsSubmitted(false);
            toast.success(content.request.submitted);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, content.request.submitError));
        },
    });

    const errors = useMemo(
        () => ({
            name: getTextValidationMessage(form.name, {
                label: content.request.name,
                required: true,
                min: 2,
                max: INPUT_LIMITS.personName,
            }),
            phone: getPhoneValidationMessage(form.phone, { required: true }),
            clinicName: getTextValidationMessage(form.clinicName, {
                label: content.request.clinic,
                required: true,
                min: 2,
                max: INPUT_LIMITS.practiceName,
            }),
            city: getTextValidationMessage(form.city, {
                label: content.request.city,
                required: true,
                min: 2,
                max: INPUT_LIMITS.shortText,
            }),
            note: getTextValidationMessage(form.note, {
                label: content.request.note,
                required: false,
                max: INPUT_LIMITS.longText,
            }),
        }),
        [content.request.city, content.request.clinic, content.request.name, content.request.note, form]
    );

    const hasErrors = Boolean(errors.name || errors.phone || errors.clinicName || errors.city || errors.note);
    const landingSettings = landingSettingsQuery.data ?? DEFAULT_LANDING_SETTINGS;

    const handleLeadRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasErrors) {
            toast.error(content.request.fixErrors);
            return;
        }

        await leadRequestMutation.mutateAsync({
            name: form.name.trim(),
            phone: form.phone.trim(),
            clinic_name: form.clinicName.trim(),
            city: form.city.trim(),
            note: form.note.trim() || undefined,
        });
    };

    return (
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_38%),linear-gradient(180deg,#f8fbff_0%,#ffffff_42%,#f5f8ff_100%)] text-slate-950">
            <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-blue-200/70">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <p className="text-xl font-semibold tracking-tight text-slate-950">Identa</p>
                    </div>

                    <nav className="hidden items-center gap-6 lg:flex">
                        <a href="#benefits" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.benefits}
                        </a>
                        <a href="#plans" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.plans}
                        </a>
                        <a href="#faq" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.faq}
                        </a>
                        <a href="#request" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.request}
                        </a>
                    </nav>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <LanguageSwitcher variant="compact" />
                        <Button asChild variant="outline" className="hidden sm:inline-flex">
                            <Link href="/login">{content.nav.signIn}</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative">
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-start lg:gap-12 lg:px-8 lg:py-16">
                        <div className="space-y-7">
                            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {content.hero.badge}
                            </div>

                            <div className="space-y-4">
                                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.06]">
                                    {content.hero.title}
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                                    {content.hero.description}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                                    <a href="#request">
                                        {content.hero.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                                    <Link href="/login">{content.hero.secondary}</Link>
                                </Button>
                            </div>

                            <p className="max-w-2xl text-sm leading-6 text-slate-500">{content.hero.helper}</p>
                        </div>

                        <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.55)]">
                            <CardContent className="space-y-6 p-6 sm:p-7">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                                        {content.hero.previewTitle}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{content.hero.previewSummary}</p>
                                </div>
                                <div className="space-y-3">
                                    {content.hero.previewItems.map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                                        >
                                            <div className="mt-0.5 rounded-xl bg-blue-50 p-2 text-blue-700">
                                                <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                                                <p className="mt-1 text-sm text-slate-600">{item.value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="benefits" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <div className="space-y-4 text-center">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.benefits.eyebrow}
                        </p>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.benefits.title}
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {content.benefits.items.map((item, index) => {
                            const Icon = BENEFIT_ICONS[index];

                            return (
                                <Card
                                    key={item.title}
                                    className="rounded-[24px] border-slate-200/80 bg-white/90 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.5)]"
                                >
                                    <CardContent className="space-y-4 p-6">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <section id="plans" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.plans.eyebrow}
                        </p>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.plans.title}
                        </h2>
                        <p className="mt-4 text-base leading-7 text-slate-600">{content.plans.description}</p>
                    </div>
                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {content.plans.items.map((plan) => {
                            const amount = getPlanAmount(landingSettings, plan.key);
                            const priceText =
                                amount <= 0
                                    ? content.plans.freePrice
                                    : formatPrice(amount, landingSettings.currency, landingLocale);

                            return (
                                <Card
                                    key={plan.title}
                                    className="rounded-[28px] border-slate-200 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.4)]"
                                >
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-2xl font-semibold text-slate-950">{plan.title}</h3>
                                                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                                            </div>
                                            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                                {plan.badge}
                                            </span>
                                        </div>

                                        <div className="mt-6 border-t border-slate-200 pt-5">
                                            <div className="flex flex-wrap items-end gap-2">
                                                <p className="text-4xl font-semibold tracking-tight text-slate-950">{priceText}</p>
                                                {plan.periodLabel ? (
                                                    <p className="pb-1 text-sm font-medium text-slate-500">{plan.periodLabel}</p>
                                                ) : null}
                                            </div>
                                            <p className="mt-2 text-sm font-medium text-blue-700">{plan.priceHint}</p>
                                        </div>

                                        <div className="mt-6 space-y-3">
                                            {plan.bullets.map((bullet) => (
                                                <div key={bullet} className="flex items-start gap-3">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                                    <p className="text-sm text-slate-700">{bullet}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <section id="request" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                        <Card className="rounded-[28px] border-slate-200 bg-slate-950 text-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.9)]">
                            <CardContent className="space-y-6 p-6 sm:p-7">
                                <div>
                                    <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                                        <MessageCircle className="mr-2 h-4 w-4" />
                                        Identa
                                    </div>
                                    <h2 className="mt-5 text-3xl font-semibold tracking-tight">{content.request.title}</h2>
                                    <p className="mt-4 text-sm leading-6 text-slate-300">{content.request.description}</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        {content.request.panelTitle}
                                    </p>
                                    {content.request.panelItems.map((item) => (
                                        <div
                                            key={item}
                                            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                                        >
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
                                            <p className="text-sm text-slate-200">{item}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[28px] border-slate-200 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.4)]">
                            <CardContent className="p-6 sm:p-7">
                                <form className="space-y-4" onSubmit={handleLeadRequestSubmit}>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.request.name} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.name}
                                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                                maxLength={INPUT_LIMITS.personName}
                                                aria-invalid={Boolean(isSubmitted && errors.name)}
                                                placeholder={content.request.name}
                                            />
                                            {isSubmitted && errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.request.phone} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.phone}
                                                onChange={(event) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        phone: formatPhoneInputValue(event.target.value),
                                                    }))
                                                }
                                                maxLength={INPUT_LIMITS.phoneFormatted}
                                                inputMode="tel"
                                                aria-invalid={Boolean(isSubmitted && errors.phone)}
                                                placeholder="+998 90 123 45 67"
                                            />
                                            {isSubmitted && errors.phone ? <p className="text-xs text-red-600">{errors.phone}</p> : null}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.request.clinic} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.clinicName}
                                                onChange={(event) =>
                                                    setForm((current) => ({ ...current, clinicName: event.target.value }))
                                                }
                                                maxLength={INPUT_LIMITS.practiceName}
                                                aria-invalid={Boolean(isSubmitted && errors.clinicName)}
                                                placeholder={content.request.clinic}
                                            />
                                            {isSubmitted && errors.clinicName ? (
                                                <p className="text-xs text-red-600">{errors.clinicName}</p>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.request.city} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.city}
                                                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                                                maxLength={INPUT_LIMITS.shortText}
                                                aria-invalid={Boolean(isSubmitted && errors.city)}
                                                placeholder={content.request.city}
                                            />
                                            {isSubmitted && errors.city ? <p className="text-xs text-red-600">{errors.city}</p> : null}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {content.request.note}{' '}
                                            <span className="text-slate-400">({content.request.optional})</span>
                                        </label>
                                        <Textarea
                                            value={form.note}
                                            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                                            maxLength={INPUT_LIMITS.longText}
                                            aria-invalid={Boolean(isSubmitted && errors.note)}
                                            placeholder={content.request.note}
                                            className="min-h-24"
                                        />
                                        {isSubmitted && errors.note ? <p className="text-xs text-red-600">{errors.note}</p> : null}
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="h-12 flex-1 rounded-xl text-base"
                                            disabled={leadRequestMutation.isPending}
                                        >
                                            {leadRequestMutation.isPending ? content.request.submitting : content.request.submit}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <Button asChild type="button" size="lg" variant="outline" className="h-12 rounded-xl px-5">
                                            <a
                                                href={buildTelegramHref(
                                                    content.request.telegramPrompt,
                                                    landingSettings.telegram_contact_url
                                                )}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {content.request.directTelegram}
                                            </a>
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="faq" className="bg-slate-950 text-white">
                    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                        <div className="max-w-3xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                                {content.faq.eyebrow}
                            </p>
                            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                                {content.faq.title}
                            </h2>
                        </div>
                        <div className="mt-10 grid gap-4 lg:grid-cols-2">
                            {content.faq.items.map((item) => (
                                <Card
                                    key={item.question}
                                    className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none"
                                >
                                    <CardContent className="p-6">
                                        <p className="text-lg font-semibold">{item.question}</p>
                                        <p className="mt-3 text-sm leading-6 text-slate-300">{item.answer}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <Card className="overflow-hidden rounded-[32px] border-0 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#0ea5e9_100%)] text-white shadow-[0_28px_90px_-50px_rgba(15,23,42,0.9)]">
                        <CardContent className="flex flex-col gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
                            <div className="max-w-2xl">
                                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                                    Identa
                                </p>
                                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                                    {content.finalCta.title}
                                </h2>
                                <p className="mt-4 text-base leading-7 text-blue-100">
                                    {content.finalCta.description}
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                                <Button
                                    asChild
                                    size="lg"
                                    className="h-12 rounded-xl bg-white px-6 text-base text-slate-950 hover:bg-slate-100"
                                >
                                    <a href="#request">
                                        {content.finalCta.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button
                                    asChild
                                    size="lg"
                                    variant="outline"
                                    className="h-12 rounded-xl border-white/20 bg-transparent px-6 text-base text-white hover:bg-white/10"
                                >
                                    <Link href="/login">{content.finalCta.secondary}</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </main>

            <footer className="border-t border-slate-200 bg-white/80">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <p>{content.footer}</p>
                    <div className="flex items-center gap-4">
                        <a
                            href={buildTelegramHref(content.request.telegramPrompt, landingSettings.telegram_contact_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="transition hover:text-slate-900"
                        >
                            {content.request.directTelegram}
                        </a>
                        <Link href="/login" className="transition hover:text-slate-900">
                            {content.nav.signIn}
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
