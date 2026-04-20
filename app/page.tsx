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
    Sparkles,
    Stethoscope,
    Users,
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

interface HeroMetric {
    value: string;
    label: string;
}

interface HeroRow {
    title: string;
    note: string;
}

interface WhyItem {
    title: string;
    description: string;
}

interface PlanItem {
    key: PlanKey;
    badge: string;
    title: string;
    description: string;
    periodLabel: string | null;
    assistants: string;
    renewal: string;
    bullets: string[];
}

interface FaqItem {
    question: string;
    answer: string;
}

interface LandingContent {
    nav: {
        why: string;
        plans: string;
        form: string;
        faq: string;
        signIn: string;
    };
    hero: {
        badge: string;
        title: string;
        description: string;
        primary: string;
        secondary: string;
        points: string[];
        panelEyebrow: string;
        panelTitle: string;
        panelDescription: string;
        metrics: HeroMetric[];
        rows: HeroRow[];
    };
    why: {
        eyebrow: string;
        title: string;
        description: string;
        items: WhyItem[];
    };
    plans: {
        eyebrow: string;
        title: string;
        description: string;
        freePrice: string;
        assistantsLabel: string;
        renewalLabel: string;
        items: PlanItem[];
    };
    form: {
        eyebrow: string;
        title: string;
        description: string;
        steps: string[];
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
        telegram: string;
        telegramPrompt: string;
    };
    faq: {
        eyebrow: string;
        title: string;
        items: FaqItem[];
    };
    finalCta: {
        title: string;
        description: string;
        primary: string;
        secondary: string;
    };
    footer: {
        tagline: string;
        signIn: string;
        telegram: string;
        copyright: string;
    };
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
            why: 'Nega',
            plans: 'Tariflar',
            form: "So'rov",
            faq: 'Savollar',
            signIn: 'Kirish',
        },
        hero: {
            badge: 'Xususiy stomatologlar va kichik klinikalar uchun',
            title: "Klinikadagi yozuvlar, bemorlar va to'lovlarni tartibli boshqaring",
            description:
                "Identa kundalik ishni soddalashtiradi: qabul jadvali, bemor kartasi, davolash tarixi va to'lov nazorati bitta tizimda ishlaydi.",
            primary: "So'rov qoldirish",
            secondary: 'Kirish',
            points: ['30 kunlik sinov muddati', '3 ta aniq tarif', 'Telefon va kompyuterda qulay'],
            panelEyebrow: 'Identa ichida',
            panelTitle: 'Bir qarashda klinika holati',
            panelDescription: "Shifokor uchun kerakli asosiy ishlar bitta ekranda ko'rinadi.",
            metrics: [
                { value: '8', label: 'Bugungi qabullar' },
                { value: '126', label: 'Faol bemorlar' },
                { value: '4.8M UZS', label: "Kutilayotgan to'lov" },
            ],
            rows: [
                { title: 'Qabul jadvali tayyor', note: "Kunlik ishni chalkashliksiz ko'rasiz" },
                { title: 'Bemor kartasi yaqin', note: 'Tarix, rasmlar va izohlar bir joyda turadi' },
                { title: "To'lov nazorati aniq", note: "Qancha tushganini va qancha qolganini ko'rasiz" },
            ],
        },
        why: {
            eyebrow: 'Nega Identa',
            title: 'Klinika uchun eng kerakli uchta ustunlik',
            description: "Murakkab tizim emas, kundalik ishda tez foyda beradigan aniq qulayliklar muhim bo'lsa, Identa shu yerda kuchli.",
            items: [
                {
                    title: 'Qabul jadvali tartibli',
                    description: "Kunlik va haftalik yozuvlarni bitta joyda boshqarasiz.",
                },
                {
                    title: 'Bemor kartalari yig‘ilgan',
                    description: 'Tarix, odontogramma, yozuv va rasmlar bir-biridan ajralmaydi.',
                },
                {
                    title: "To'lov nazorati sodda",
                    description: "Tushum va qarzdorlik bir ko'rinishda aniq turadi.",
                },
            ],
        },
        plans: {
            eyebrow: 'Tariflar',
            title: 'Klinikaga mos tarifni tez tanlaysiz',
            description: "Har bir tarifda farq aniq: muddat, assistent limiti va yangilanish tartibi ko'rsatilgan.",
            freePrice: 'Bepul',
            assistantsLabel: 'Assistentlar',
            renewalLabel: 'Yangilanish',
            items: [
                {
                    key: 'trial',
                    badge: '30 kun',
                    title: 'Sinov muddati',
                    description: "Tizimni real ish jarayonida tekshirib ko'rish uchun.",
                    periodLabel: null,
                    assistants: '1 ta assistentgacha',
                    renewal: 'Keyin pullik tarif tanlanadi',
                    bullets: [
                        'Asosiy bo‘limlar ochiq bo‘ladi',
                        'Boshlash uchun qulay',
                        'Tizimni bemalol sinash mumkin',
                    ],
                },
                {
                    key: 'monthly',
                    badge: 'Har oy',
                    title: 'Oylik tarif',
                    description: 'Faol ishlayotgan xususiy amaliyot uchun moslashuvchan variant.',
                    periodLabel: '/ oy',
                    assistants: '3 ta assistentgacha',
                    renewal: 'Har oy yangilanadi',
                    bullets: [
                        "Qabullar, bemorlar va to'lovlar to'liq ishlaydi",
                        'Jamoa bilan kundalik ish uchun qulay',
                        'Qisqa muddatli boshqaruv uchun mos',
                    ],
                },
                {
                    key: 'yearly',
                    badge: 'Bir yil',
                    title: 'Yillik tarif',
                    description: 'Barqaror klinika uchun uzoq muddatli va qulayroq format.',
                    periodLabel: '/ yil',
                    assistants: '5 ta assistentgacha',
                    renewal: 'Yiliga bir marta yangilanadi',
                    bullets: [
                        "To'liq ishchi kirish saqlanadi",
                        'Uzoq muddat uchun qulay',
                        'Kengroq jamoa uchun mos',
                    ],
                },
            ],
        },
        form: {
            eyebrow: "So'rov",
            title: 'Ulanish yoki ko‘rsatish uchun so‘rov qoldiring',
            description: "Formani yuborasiz yoki xohlasangiz darrov Telegram orqali yozasiz.",
            steps: [
                "So'rovni olamiz va siz bilan bog'lanamiz",
                "Tizimni qisqacha ko'rsatib beramiz",
                'Mos tarifni tanlashga yordam beramiz',
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
            telegram: 'Telegram orqali yozish',
            telegramPrompt: "Identa haqida ma'lumot olmoqchiman",
        },
        faq: {
            eyebrow: 'Savollar',
            title: 'Asosiy savollarga qisqa javoblar',
            items: [
                {
                    question: 'Tizimga qanday ulanaman?',
                    answer: "Saytdan so'rov yuborasiz yoki Telegram orqali yozasiz. Keyin qisqacha tanishtirib, kirish ochiladi.",
                },
                {
                    question: 'Sinov muddati bormi?',
                    answer: "Ha. Tizimni 30 kun davomida real klinika ishida sinab ko'rishingiz mumkin.",
                },
                {
                    question: 'Telefonda ishlaydimi?',
                    answer: 'Ha. Telefon, planshet va kompyuter uchun moslashtirilgan.',
                },
                {
                    question: 'Kimlar uchun mos?',
                    answer: 'Xususiy stomatologlar va kichik klinikalar uchun.',
                },
            ],
        },
        finalCta: {
            title: "Klinikadagi tartibni bitta tizimga yig'ishga tayyormisiz?",
            description: "So'rov qoldiring yoki darrov tizimga kirib ishni davom ettiring.",
            primary: "So'rov qoldirish",
            secondary: 'Kirish',
        },
        footer: {
            tagline: 'Xususiy stomatologlar va kichik klinikalar uchun',
            signIn: 'Kirish',
            telegram: 'Telegram',
            copyright: "(c) 2026 Identa. Barcha huquqlar himoyalangan.",
        },
    },
    ru: {
        nav: {
            why: 'Почему',
            plans: 'Тарифы',
            form: 'Заявка',
            faq: 'Вопросы',
            signIn: 'Войти',
        },
        hero: {
            badge: 'Для частных стоматологов и небольших клиник',
            title: 'Держите записи, пациентов и оплаты в одном порядке',
            description:
                'Identa упрощает ежедневную работу клиники: расписание, карточки пациентов, история лечения и контроль оплат собраны в одной системе.',
            primary: 'Оставить заявку',
            secondary: 'Войти',
            points: ['30 дней для проверки', '3 понятных тарифа', 'Удобно на телефоне и компьютере'],
            panelEyebrow: 'Внутри Identa',
            panelTitle: 'Состояние клиники видно сразу',
            panelDescription: 'Основные рабочие процессы находятся перед глазами и не теряются.',
            metrics: [
                { value: '8', label: 'Записи на сегодня' },
                { value: '126', label: 'Активные пациенты' },
                { value: '4.8M UZS', label: 'Ожидается к оплате' },
            ],
            rows: [
                { title: 'Расписание готово', note: 'Вся дневная нагрузка видна без путаницы' },
                { title: 'Карточка пациента рядом', note: 'История, изображения и заметки собраны вместе' },
                { title: 'Оплаты под контролем', note: 'Сразу видно, что оплачено и что еще осталось' },
            ],
        },
        why: {
            eyebrow: 'Почему Identa',
            title: 'Три причины выбрать систему для ежедневной работы',
            description: 'Если важны порядок, скорость и понятная картина по клинике, Identa закрывает именно эти задачи.',
            items: [
                {
                    title: 'Расписание без путаницы',
                    description: 'Записи на день и неделю ведутся в одном месте.',
                },
                {
                    title: 'Карточки пациентов собраны рядом',
                    description: 'История, одонтограмма, заметки и изображения не расходятся по разным окнам.',
                },
                {
                    title: 'Оплаты видны сразу',
                    description: 'Легко понять, что оплачено и какие суммы еще ожидаются.',
                },
            ],
        },
        plans: {
            eyebrow: 'Тарифы',
            title: 'Подходящий тариф выбирается без лишних вопросов',
            description: 'Разница показана ясно: срок, лимит ассистентов и порядок обновления.',
            freePrice: 'Бесплатно',
            assistantsLabel: 'Ассистенты',
            renewalLabel: 'Обновление',
            items: [
                {
                    key: 'trial',
                    badge: '30 дней',
                    title: 'Пробный период',
                    description: 'Для спокойной проверки системы на реальной работе клиники.',
                    periodLabel: null,
                    assistants: 'До 1 ассистента',
                    renewal: 'Дальше выбирается платный тариф',
                    bullets: [
                        'Открыты основные разделы',
                        'Удобно для первого запуска',
                        'Можно спокойно проверить систему',
                    ],
                },
                {
                    key: 'monthly',
                    badge: 'Каждый месяц',
                    title: 'Месячный тариф',
                    description: 'Гибкий вариант для активной частной практики.',
                    periodLabel: '/ месяц',
                    assistants: 'До 3 ассистентов',
                    renewal: 'Обновляется каждый месяц',
                    bullets: [
                        'Записи, пациенты и оплаты работают полностью',
                        'Подходит для ежедневной работы команды',
                        'Удобно, если нужна гибкость',
                    ],
                },
                {
                    key: 'yearly',
                    badge: 'На год',
                    title: 'Годовой тариф',
                    description: 'Долгосрочный формат для стабильной клиники.',
                    periodLabel: '/ год',
                    assistants: 'До 5 ассистентов',
                    renewal: 'Обновляется один раз в год',
                    bullets: [
                        'Полный рабочий доступ сохраняется',
                        'Удобно на длинный срок',
                        'Подходит для команды побольше',
                    ],
                },
            ],
        },
        form: {
            eyebrow: 'Заявка',
            title: 'Оставьте заявку на подключение или показ',
            description: 'Можно отправить форму на сайте или сразу написать нам в Telegram.',
            steps: [
                'Получаем заявку и быстро связываемся',
                'Коротко показываем систему',
                'Помогаем выбрать подходящий тариф',
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
            submitError: 'Не удалось отправить заявку. Попробуйте еще раз.',
            fixErrors: 'Проверьте обязательные поля.',
            telegram: 'Написать в Telegram',
            telegramPrompt: 'Хочу узнать подробнее об Identa',
        },
        faq: {
            eyebrow: 'Вопросы',
            title: 'Короткие ответы на главное',
            items: [
                {
                    question: 'Как получить доступ к системе?',
                    answer: 'Оставляете заявку на сайте или пишете в Telegram. После короткого знакомства доступ открывается.',
                },
                {
                    question: 'Есть ли пробный период?',
                    answer: 'Да. Систему можно проверить 30 дней на реальной работе клиники.',
                },
                {
                    question: 'Работает ли на телефоне?',
                    answer: 'Да. Интерфейс адаптирован для телефона, планшета и компьютера.',
                },
                {
                    question: 'Кому подходит Identa?',
                    answer: 'Частным стоматологам и небольшим клиникам.',
                },
            ],
        },
        finalCta: {
            title: 'Готовы навести порядок в работе клиники?',
            description: 'Оставьте заявку или сразу войдите, если доступ уже открыт.',
            primary: 'Оставить заявку',
            secondary: 'Войти',
        },
        footer: {
            tagline: 'Для частных стоматологов и небольших клиник',
            signIn: 'Войти',
            telegram: 'Telegram',
            copyright: '(c) 2026 Identa. Все права защищены.',
        },
    },
    en: {
        nav: {
            why: 'Why',
            plans: 'Plans',
            form: 'Request',
            faq: 'FAQ',
            signIn: 'Sign in',
        },
        hero: {
            badge: 'Built for private dentists and small clinics',
            title: 'Keep appointments, patients, and payments in one clear system',
            description:
                'Identa simplifies the daily clinic workflow: scheduling, patient records, treatment history, and payment control stay together.',
            primary: 'Request access',
            secondary: 'Sign in',
            points: ['30-day trial', '3 clear plans', 'Comfortable on phone and desktop'],
            panelEyebrow: 'Inside Identa',
            panelTitle: 'Clinic status stays visible at a glance',
            panelDescription: 'The most important daily actions stay in front of the doctor without extra switching.',
            metrics: [
                { value: '8', label: 'Appointments today' },
                { value: '126', label: 'Active patients' },
                { value: '4.8M UZS', label: 'Pending payments' },
            ],
            rows: [
                { title: 'Schedule stays ready', note: 'The day workload remains easy to read' },
                { title: 'Patient records stay close', note: 'History, images, and notes stay together' },
                { title: 'Payments stay controlled', note: 'Paid and pending amounts are visible right away' },
            ],
        },
        why: {
            eyebrow: 'Why Identa',
            title: 'Three reasons clinics choose it quickly',
            description: 'If clarity, speed, and daily visibility matter most, Identa focuses exactly on those essentials.',
            items: [
                {
                    title: 'Scheduling stays organized',
                    description: 'Daily and weekly appointments are handled in one place.',
                },
                {
                    title: 'Patient records stay together',
                    description: 'History, odontogram, notes, and images stay in the same workflow.',
                },
                {
                    title: 'Payments stay easy to read',
                    description: 'It is simple to see what was paid and what is still pending.',
                },
            ],
        },
        plans: {
            eyebrow: 'Plans',
            title: 'Choose the right plan without guesswork',
            description: 'The difference is clear in duration, assistant limits, and renewal logic.',
            freePrice: 'Free',
            assistantsLabel: 'Assistants',
            renewalLabel: 'Renewal',
            items: [
                {
                    key: 'trial',
                    badge: '30 days',
                    title: 'Trial period',
                    description: 'For checking the system in a real clinic workflow.',
                    periodLabel: null,
                    assistants: 'Up to 1 assistant',
                    renewal: 'A paid plan is chosen after the trial',
                    bullets: [
                        'Core sections stay open',
                        'Comfortable for a first launch',
                        'Easy way to evaluate the system',
                    ],
                },
                {
                    key: 'monthly',
                    badge: 'Monthly',
                    title: 'Monthly plan',
                    description: 'A flexible option for active private practice.',
                    periodLabel: '/ month',
                    assistants: 'Up to 3 assistants',
                    renewal: 'Renews every month',
                    bullets: [
                        'Appointments, patients, and payments stay fully available',
                        'Good for team daily work',
                        'Works well when flexibility matters',
                    ],
                },
                {
                    key: 'yearly',
                    badge: 'Yearly',
                    title: 'Yearly plan',
                    description: 'A longer-term format for stable clinics.',
                    periodLabel: '/ year',
                    assistants: 'Up to 5 assistants',
                    renewal: 'Renews once a year',
                    bullets: [
                        'Full working access remains open',
                        'Comfortable for long-term use',
                        'Fits a larger team better',
                    ],
                },
            ],
        },
        form: {
            eyebrow: 'Request',
            title: 'Request a demo or clinic access',
            description: 'Send the form on the site or contact us directly on Telegram.',
            steps: [
                'We receive the request and reply quickly',
                'We show the system briefly',
                'We help choose the right plan',
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
            telegram: 'Write on Telegram',
            telegramPrompt: 'I want to learn more about Identa',
        },
        faq: {
            eyebrow: 'FAQ',
            title: 'Short answers to the main questions',
            items: [
                {
                    question: 'How do I get access?',
                    answer: 'Leave a request on the site or contact us on Telegram. After a short intro, access is opened.',
                },
                {
                    question: 'Is there a trial period?',
                    answer: 'Yes. You can test the system for 30 days in a real clinic workflow.',
                },
                {
                    question: 'Does it work on mobile?',
                    answer: 'Yes. The interface is adapted for phone, tablet, and desktop use.',
                },
                {
                    question: 'Who is it for?',
                    answer: 'Private dentists and small clinics.',
                },
            ],
        },
        finalCta: {
            title: 'Ready to make clinic work cleaner?',
            description: 'Send a request or sign in right away if access is already open.',
            primary: 'Request access',
            secondary: 'Sign in',
        },
        footer: {
            tagline: 'Built for private dentists and small clinics',
            signIn: 'Sign in',
            telegram: 'Telegram',
            copyright: '(c) 2026 Identa. All rights reserved.',
        },
    },
};

const WHY_ICONS = [CalendarDays, Stethoscope, CreditCard] as const;

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
            directUrl.searchParams.set('text', message);

            return directUrl.toString();
        } catch {
            return configuredUrl;
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
            toast.success(content.form.submitted);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, content.form.submitError));
        },
    });

    const errors = useMemo(
        () => ({
            name: getTextValidationMessage(form.name, {
                label: content.form.name,
                required: true,
                min: 2,
                max: INPUT_LIMITS.personName,
            }),
            phone: getPhoneValidationMessage(form.phone, { required: true }),
            clinicName: getTextValidationMessage(form.clinicName, {
                label: content.form.clinic,
                required: true,
                min: 2,
                max: INPUT_LIMITS.practiceName,
            }),
            city: getTextValidationMessage(form.city, {
                label: content.form.city,
                required: true,
                min: 2,
                max: INPUT_LIMITS.shortText,
            }),
            note: getTextValidationMessage(form.note, {
                label: content.form.note,
                required: false,
                max: INPUT_LIMITS.longText,
            }),
        }),
        [content.form.city, content.form.clinic, content.form.name, content.form.note, form]
    );

    const hasErrors = Boolean(errors.name || errors.phone || errors.clinicName || errors.city || errors.note);
    const landingSettings = landingSettingsQuery.data ?? DEFAULT_LANDING_SETTINGS;

    const handleLeadRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasErrors) {
            toast.error(content.form.fixErrors);
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
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_14%_8%,rgba(96,165,250,0.18),transparent_26%),radial-gradient(circle_at_78%_10%,rgba(191,219,254,0.34),transparent_24%),radial-gradient(circle_at_86%_2%,rgba(255,255,255,0.95),transparent_18%),linear-gradient(180deg,#f5f9ff_0%,#ffffff_42%,#f8fbff_100%)] text-slate-950">
            <header className="border-b border-slate-200/80 bg-white/88 backdrop-blur-xl">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between gap-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_42px_-22px_rgba(15,23,42,0.72)]">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <p className="text-xl font-semibold tracking-tight">Identa</p>
                        </div>

                        <nav className="hidden items-center gap-6 lg:flex">
                            <a href="#why" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                                {content.nav.why}
                            </a>
                            <a href="#plans" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                                {content.nav.plans}
                            </a>
                            <a href="#form" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                                {content.nav.form}
                            </a>
                            <a href="#faq" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                                {content.nav.faq}
                            </a>
                        </nav>

                        <div className="flex items-center gap-2 sm:gap-3">
                            <LanguageSwitcher variant="compact" />
                            <Button asChild variant="outline" className="hidden rounded-xl sm:inline-flex">
                                <Link href="/login">{content.nav.signIn}</Link>
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-8 py-12 sm:py-14 lg:grid-cols-[1fr_0.96fr] lg:items-center lg:gap-10 lg:py-16">
                        <div className="max-w-3xl">
                            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {content.hero.badge}
                            </div>

                            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.02]">
                                {content.hero.title}
                            </h1>
                            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                                {content.hero.description}
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                {content.hero.points.map((point) => (
                                    <div
                                        key={point}
                                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                        {point}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                                    <a href="#form">
                                        {content.hero.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                                    <Link href="/login">{content.hero.secondary}</Link>
                                </Button>
                            </div>
                        </div>

                        <Card className="rounded-[32px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,250,255,0.98)_54%,rgba(255,255,255,0.98)_100%)] shadow-[0_34px_100px_-50px_rgba(15,23,42,0.52)]">
                            <CardContent className="p-6 sm:p-7">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                                            {content.hero.panelEyebrow}
                                        </p>
                                        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                                            {content.hero.panelTitle}
                                        </h2>
                                        <p className="mt-3 text-sm leading-6 text-slate-600">
                                            {content.hero.panelDescription}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                    {content.hero.metrics.map((metric, index) => {
                                        const Icon = index === 0 ? CalendarDays : index === 1 ? Users : CreditCard;

                                        return (
                                            <div
                                                key={metric.label}
                                                className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4"
                                            >
                                                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <p className="text-2xl font-semibold tracking-tight text-slate-950">
                                                    {metric.value}
                                                </p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500">{metric.label}</p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-5 space-y-3 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 sm:p-5">
                                    {content.hero.rows.map((row) => (
                                        <div
                                            key={row.title}
                                            className="rounded-2xl border border-white/80 bg-white px-4 py-4 shadow-sm"
                                        >
                                            <p className="text-sm font-semibold text-slate-950">{row.title}</p>
                                            <p className="mt-1 text-sm leading-6 text-slate-600">{row.note}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </header>

            <main>
                <section id="why" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.why.eyebrow}
                        </p>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.why.title}
                        </h2>
                        <p className="mt-4 text-base leading-7 text-slate-600">{content.why.description}</p>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {content.why.items.map((item, index) => {
                            const Icon = WHY_ICONS[index];

                            return (
                                <Card
                                    key={item.title}
                                    className="rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)]"
                                >
                                    <CardContent className="p-6">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <h3 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h3>
                                        <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <section id="plans" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
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
                                    key={plan.key}
                                    className="h-full rounded-[30px] border border-slate-200 bg-white shadow-[0_26px_70px_-44px_rgba(15,23,42,0.36)]"
                                >
                                    <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                        <div className="flex min-h-[148px] flex-col">
                                            <div className="flex items-start justify-between gap-4">
                                                <h3 className="max-w-[220px] text-2xl font-semibold tracking-tight text-slate-950">
                                                    {plan.title}
                                                </h3>
                                                <span className="inline-flex min-h-10 min-w-[98px] items-center justify-center rounded-full bg-slate-950 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                                    {plan.badge}
                                                </span>
                                            </div>
                                            <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
                                        </div>

                                        <div className="mt-6 rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                                            <div className="flex min-h-[56px] items-end gap-2">
                                                <p className="text-[2rem] font-semibold tracking-tight text-slate-950 sm:text-[2.15rem]">
                                                    {priceText}
                                                </p>
                                                {plan.periodLabel ? (
                                                    <p className="pb-1 text-sm font-medium text-slate-500">{plan.periodLabel}</p>
                                                ) : null}
                                            </div>

                                            <div className="mt-5 space-y-3">
                                                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                        {content.plans.assistantsLabel}
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold text-blue-700">{plan.assistants}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                        {content.plans.renewalLabel}
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                                                        {plan.renewal}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex-1 space-y-3">
                                            {plan.bullets.map((bullet) => (
                                                <div key={bullet} className="flex items-start gap-3">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                                    <p className="text-sm leading-6 text-slate-700">{bullet}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <section id="form" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
                        <Card className="h-full rounded-[30px] border border-slate-900 bg-slate-950 text-white shadow-[0_32px_90px_-44px_rgba(15,23,42,0.9)]">
                            <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    {content.form.eyebrow}
                                </div>

                                <h2 className="mt-5 text-3xl font-semibold tracking-tight">{content.form.title}</h2>
                                <p className="mt-4 text-sm leading-6 text-slate-300">{content.form.description}</p>

                                <div className="mt-6 flex-1 space-y-3">
                                    {content.form.steps.map((step, index) => (
                                        <div
                                            key={step}
                                            className="flex items-start gap-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
                                        >
                                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-blue-300/40 bg-blue-300/10 text-sm font-semibold text-blue-200">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-6 text-slate-200">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="h-full rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_90px_-46px_rgba(15,23,42,0.38)]">
                            <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                <form className="flex h-full flex-col gap-4" onSubmit={handleLeadRequestSubmit}>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.form.name} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.name}
                                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                                maxLength={INPUT_LIMITS.personName}
                                                aria-invalid={Boolean(isSubmitted && errors.name)}
                                                placeholder={content.form.name}
                                            />
                                            {isSubmitted && errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.form.phone} <span className="text-red-500">*</span>
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
                                                {content.form.clinic} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.clinicName}
                                                onChange={(event) =>
                                                    setForm((current) => ({ ...current, clinicName: event.target.value }))
                                                }
                                                maxLength={INPUT_LIMITS.practiceName}
                                                aria-invalid={Boolean(isSubmitted && errors.clinicName)}
                                                placeholder={content.form.clinic}
                                            />
                                            {isSubmitted && errors.clinicName ? (
                                                <p className="text-xs text-red-600">{errors.clinicName}</p>
                                            ) : null}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-800">
                                                {content.form.city} <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                value={form.city}
                                                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                                                maxLength={INPUT_LIMITS.shortText}
                                                aria-invalid={Boolean(isSubmitted && errors.city)}
                                                placeholder={content.form.city}
                                            />
                                            {isSubmitted && errors.city ? <p className="text-xs text-red-600">{errors.city}</p> : null}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-800">
                                            {content.form.note} <span className="text-slate-400">({content.form.optional})</span>
                                        </label>
                                        <Textarea
                                            value={form.note}
                                            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                                            maxLength={INPUT_LIMITS.longText}
                                            aria-invalid={Boolean(isSubmitted && errors.note)}
                                            placeholder={content.form.note}
                                            className="min-h-28"
                                        />
                                        {isSubmitted && errors.note ? <p className="text-xs text-red-600">{errors.note}</p> : null}
                                    </div>

                                    <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="h-12 flex-1 rounded-xl text-base"
                                            disabled={leadRequestMutation.isPending}
                                        >
                                            {leadRequestMutation.isPending ? content.form.submitting : content.form.submit}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <Button asChild type="button" size="lg" variant="outline" className="h-12 rounded-xl px-5">
                                            <a
                                                href={buildTelegramHref(content.form.telegramPrompt, landingSettings.telegram_contact_url)}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {content.form.telegram}
                                            </a>
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="faq" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.faq.eyebrow}
                        </p>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.faq.title}
                        </h2>
                    </div>

                    <div className="mt-10 grid gap-4 lg:grid-cols-2">
                        {content.faq.items.map((item) => (
                            <Card
                                key={item.question}
                                className="rounded-[26px] border border-slate-200 bg-white shadow-[0_20px_48px_-36px_rgba(15,23,42,0.32)]"
                            >
                                <CardContent className="p-6">
                                    <p className="text-lg font-semibold text-slate-950">{item.question}</p>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
                    <Card className="overflow-hidden rounded-[30px] border border-blue-100 bg-[linear-gradient(135deg,#1d4ed8_0%,#3b82f6_45%,#93c5fd_100%)] text-white shadow-[0_30px_90px_-50px_rgba(59,130,246,0.55)]">
                        <CardContent className="flex flex-col gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
                            <div className="max-w-2xl">
                                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                                    Identa
                                </p>
                                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                                    {content.finalCta.title}
                                </h2>
                                <p className="mt-4 text-base leading-7 text-blue-50">
                                    {content.finalCta.description}
                                </p>
                            </div>

                            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                                <Button
                                    asChild
                                    size="lg"
                                    className="h-12 rounded-xl bg-white px-6 text-base text-slate-950 hover:bg-slate-100"
                                >
                                    <a href="#form">
                                        {content.finalCta.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button
                                    asChild
                                    size="lg"
                                    variant="outline"
                                    className="h-12 rounded-xl border-white/25 bg-transparent px-6 text-base text-white hover:bg-white/10"
                                >
                                    <Link href="/login">{content.finalCta.secondary}</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </main>

            <footer className="border-t border-slate-200 bg-white/80">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <div>
                        <p className="text-sm font-semibold text-slate-950">Identa</p>
                        <p className="mt-0.5 text-xs text-slate-500">{content.footer.tagline}</p>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                        <a
                            href={buildTelegramHref(content.form.telegramPrompt, landingSettings.telegram_contact_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="transition hover:text-slate-900"
                        >
                            {content.footer.telegram}
                        </a>
                        <Link href="/login" className="transition hover:text-slate-900">
                            {content.footer.signIn}
                        </Link>
                    </div>
                </div>
                <div className="mx-auto max-w-7xl px-4 pb-3 text-[11px] text-slate-400 sm:px-6 lg:px-8">
                    {content.footer.copyright}
                </div>
            </footer>
        </div>
    );
}
