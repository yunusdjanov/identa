'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    Clock3,
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
    label: string;
    value: string;
    hint: string;
}

interface HeroTimelineItem {
    time: string;
    title: string;
    note: string;
}

interface HeroDetailItem {
    title: string;
    description: string;
}

interface BenefitItem {
    title: string;
    description: string;
}

interface PlanContent {
    key: PlanKey;
    title: string;
    badge: string;
    description: string;
    periodLabel: string | null;
    seatLabel: string;
    renewalLabel: string;
    bullets: string[];
}

interface FaqItem {
    question: string;
    answer: string;
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
        chips: string[];
        previewEyebrow: string;
        previewTitle: string;
        previewDescription: string;
        previewStatus: string;
        metrics: HeroMetric[];
        timelineTitle: string;
        timeline: HeroTimelineItem[];
        details: HeroDetailItem[];
    };
    benefits: {
        eyebrow: string;
        title: string;
        description: string;
        items: BenefitItem[];
    };
    plans: {
        eyebrow: string;
        title: string;
        description: string;
        freePrice: string;
        teamCaption: string;
        renewalCaption: string;
        items: PlanContent[];
    };
    request: {
        title: string;
        description: string;
        panelEyebrow: string;
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
        items: FaqItem[];
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
            benefits: 'Imkoniyatlar',
            plans: 'Tariflar',
            faq: 'Savollar',
            request: "So'rov",
            signIn: 'Kirish',
        },
        hero: {
            badge: 'Xususiy stomatologlar va kichik klinikalar uchun',
            title: "Qabullar, bemorlar va to'lovlar bitta tizimda boshqariladi",
            description:
                "Identa klinikaning kundalik ishini soddalashtiradi: jadval, bemor kartasi, davolash tarixi va qarzdorlik nazorati bir joyda turadi.",
            primary: "So'rov qoldirish",
            secondary: 'Kirish',
            chips: ['30 kunlik sinov', '3 ta tarif', 'Telegram orqali aloqa'],
            previewEyebrow: 'Identa ichida',
            previewTitle: 'Shifokor uchun tayyor ish oqimi',
            previewDescription:
                "Asosiy jarayonlar bitta ekranda ko'rinadi, shuning uchun ishni uzmasdan davom ettirish oson.",
            previewStatus: 'Bugun',
            metrics: [
                { label: 'Bugungi qabullar', value: '8', hint: 'Kunlik jadval tayyor' },
                { label: 'Aktiv bemorlar', value: '126', hint: "Kartalar qo'l ostida" },
                { label: "Kutilayotgan to'lov", value: '4.8M UZS', hint: 'Qarz nazorati aniq' },
            ],
            timelineTitle: 'Kun rejasi',
            timeline: [
                {
                    time: '09:00',
                    title: 'Nazorat qabuli',
                    note: "Bemor kartasi va davolash tarixi shu zahoti ochiladi",
                },
                {
                    time: '10:30',
                    title: 'Oqartirish',
                    note: "Oldingi yozuvlar va rasmlar bemor bilan birga ko'rinadi",
                },
                {
                    time: '12:00',
                    title: "To'lov nazorati",
                    note: "Qancha to'langan va qancha qolganini birdan ko'rasiz",
                },
            ],
            details: [
                {
                    title: 'Bemor kartasi tayyor',
                    description: "Izohlar, rasmlar va odontogramma bir joyda turadi.",
                },
                {
                    title: "To'lovlar nazorati yo'qolmaydi",
                    description: "Qarzdorlik va tushum bir ko'rinishda ko'rinadi.",
                },
            ],
        },
        benefits: {
            eyebrow: 'Nega Identa',
            title: 'Klinika uchun eng kerakli uchta ustunlik',
            description: "Murakkab sozlamalardan ko'ra tez ishlash va aniq ko'rinish muhim bo'lsa, Identa shu yerda yordam beradi.",
            items: [
                {
                    title: 'Qabul jadvali tartibli',
                    description: "Kunlik va haftalik yozuvlarni chalkashliksiz boshqarasiz.",
                },
                {
                    title: 'Bemor kartalari yaqin',
                    description: 'Tarix, yozuv, odontogramma va rasmlar bir joyda saqlanadi.',
                },
                {
                    title: "To'lov nazorati sodda",
                    description: "Qancha tushum bo'lgani va qancha qarz qolgani birdan ko'rinadi.",
                },
            ],
        },
        plans: {
            eyebrow: 'Tariflar',
            title: 'Har bir klinika uchun aniq tarif',
            description: "Farq sodda va tushunarli: muddat, assistent limiti va uzaytirish tartibi bo'yicha tanlaysiz.",
            freePrice: 'Bepul',
            teamCaption: 'Jamoa',
            renewalCaption: 'Uzaytirish',
            items: [
                {
                    key: 'trial',
                    title: 'Sinov muddati',
                    badge: '30 kun',
                    description: "Tizimni real ish jarayonida ko'rib chiqish uchun boshlang'ich variant.",
                    periodLabel: null,
                    seatLabel: '1 ta assistentgacha',
                    renewalLabel: 'Keyin pullik tarif tanlanadi',
                    bullets: [
                        'Asosiy modullar ochiq bo‘ladi',
                        "Tez boshlash uchun yetarli imkoniyatlar bor",
                        'Tizimni bemalol sinab ko‘rish mumkin',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Oylik tarif',
                    badge: 'Oyma-oy',
                    description: 'Faol ishlayotgan xususiy amaliyot uchun mos va moslashuvchan variant.',
                    periodLabel: '/ oy',
                    seatLabel: '3 ta assistentgacha',
                    renewalLabel: 'Har oy yangilanadi',
                    bullets: [
                        "Qabullar, bemorlar va to'lovlar to'liq ishlaydi",
                        'Jamoa bilan kundalik ish uchun qulay',
                        'Qisqa muddatli boshqaruv uchun mos',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Yillik tarif',
                    badge: 'Bir yil',
                    description: 'Barqaror klinika uchun uzoq muddatli va qulayroq format.',
                    periodLabel: '/ yil',
                    seatLabel: '5 ta assistentgacha',
                    renewalLabel: 'Yiliga bir marta yangilanadi',
                    bullets: [
                        "To'liq ishchi kirish saqlanadi",
                        'Uzoq muddat uchun qulay',
                        'Kengroq jamoa bilan ishlash mumkin',
                    ],
                },
            ],
        },
        request: {
            title: "Demo yoki ulanish uchun so'rov qoldiring",
            description: "Formani yuborasiz yoki xohlasangiz darrov Telegram orqali yozasiz.",
            panelEyebrow: 'Keyingi qadamlar',
            panelTitle: 'Jarayon qisqa va tushunarli',
            panelItems: [
                "So'rovni olamiz va siz bilan tez bog'lanamiz",
                "Qisqa ko'rsatib beramiz va mos tarifni aniqlaymiz",
                'Kirishni ochib, ishni boshlashga yordam beramiz',
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
            directTelegram: 'Telegram orqali yozish',
            telegramPrompt: 'Identa haqida ma’lumot olmoqchiman',
        },
        faq: {
            eyebrow: 'Savollar',
            title: 'Asosiy savollarga qisqa javoblar',
            items: [
                {
                    question: 'Tizimga qanday ulanaman?',
                    answer: "Saytdan so'rov yuborasiz yoki Telegram orqali yozasiz. Qisqa ko'rsatmadan keyin kirish ochiladi.",
                },
                {
                    question: 'Sinov muddati bormi?',
                    answer: 'Ha. Tizimni 30 kun davomida real klinika ishida sinab ko‘rish mumkin.',
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
            description: "So'rov qoldiring yoki mavjud kirish bilan tizimga o'ting.",
            primary: "So'rov qoldirish",
            secondary: 'Kirish',
        },
        footer: "(c) 2026 Identa. O'zbekistondagi xususiy stomatologlar va kichik klinikalar uchun.",
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
            title: 'Записи, пациенты и оплаты под контролем в одной системе',
            description:
                'Identa упрощает ежедневную работу клиники: расписание, карточки пациентов, история лечения и контроль оплат собраны в одном месте.',
            primary: 'Оставить заявку',
            secondary: 'Войти',
            chips: ['30 дней для проверки', '3 тарифа', 'Связь через Telegram'],
            previewEyebrow: 'Внутри Identa',
            previewTitle: 'Рабочий день, который видно сразу',
            previewDescription:
                'Ключевые действия клиники находятся перед глазами, поэтому работу легко продолжать без лишних переходов.',
            previewStatus: 'Сегодня',
            metrics: [
                { label: 'Записи на сегодня', value: '8', hint: 'Расписание готово' },
                { label: 'Активные пациенты', value: '126', hint: 'Карточки под рукой' },
                { label: 'Ожидается к оплате', value: '4.8M UZS', hint: 'Долги под контролем' },
            ],
            timelineTitle: 'Поток работы на день',
            timeline: [
                {
                    time: '09:00',
                    title: 'Контрольный прием',
                    note: 'Карточка пациента и история лечения открываются сразу',
                },
                {
                    time: '10:30',
                    title: 'Отбеливание',
                    note: 'Предыдущие записи и изображения остаются рядом с пациентом',
                },
                {
                    time: '12:00',
                    title: 'Проверка оплат',
                    note: 'Сразу видно, что оплачено и что еще осталось',
                },
            ],
            details: [
                {
                    title: 'Карточка пациента рядом',
                    description: 'История, заметки, изображения и одонтограмма не теряются.',
                },
                {
                    title: 'Оплаты под контролем',
                    description: 'Долги и поступления видны без отдельных таблиц.',
                },
            ],
        },
        benefits: {
            eyebrow: 'Почему Identa',
            title: 'Три преимущества для ежедневной работы',
            description: 'Если важны порядок, скорость и понятная картина по клинике, Identa закрывает эти задачи сразу.',
            items: [
                {
                    title: 'Расписание без путаницы',
                    description: 'Удобно вести записи на день и неделю в одном месте.',
                },
                {
                    title: 'Карточки пациентов собраны рядом',
                    description: 'История, одонтограмма, заметки и изображения хранятся вместе.',
                },
                {
                    title: 'Оплаты видны без лишних действий',
                    description: 'Легко понять, что оплачено и какие суммы еще ожидаются.',
                },
            ],
        },
        plans: {
            eyebrow: 'Тарифы',
            title: 'Три понятных варианта для клиники',
            description: 'Разница показана ясно: срок, лимит ассистентов и порядок продления.',
            freePrice: 'Бесплатно',
            teamCaption: 'Команда',
            renewalCaption: 'Продление',
            items: [
                {
                    key: 'trial',
                    title: 'Пробный период',
                    badge: '30 дней',
                    description: 'Стартовый вариант, чтобы спокойно проверить систему на реальной работе клиники.',
                    periodLabel: null,
                    seatLabel: 'До 1 ассистента',
                    renewalLabel: 'Дальше выбирается платный тариф',
                    bullets: [
                        'Открыты основные модули',
                        'Достаточно для первого запуска',
                        'Подходит для спокойной проверки',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Месячный тариф',
                    badge: 'Каждый месяц',
                    description: 'Гибкий вариант для частной практики с активной ежедневной нагрузкой.',
                    periodLabel: '/ месяц',
                    seatLabel: 'До 3 ассистентов',
                    renewalLabel: 'Обновляется каждый месяц',
                    bullets: [
                        'Полный рабочий доступ',
                        'Записи, пациенты и оплаты работают без ограничений',
                        'Удобно, если нужен гибкий формат',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Годовой тариф',
                    badge: 'На год',
                    description: 'Долгосрочный формат для стабильной клиники с постоянной загрузкой.',
                    periodLabel: '/ год',
                    seatLabel: 'До 5 ассистентов',
                    renewalLabel: 'Обновляется один раз в год',
                    bullets: [
                        'Полный рабочий доступ',
                        'Удобно для длинного горизонта работы',
                        'Подходит для команды побольше',
                    ],
                },
            ],
        },
        request: {
            title: 'Оставьте заявку на демо или подключение',
            description: 'Можно отправить форму на сайте или сразу написать нам в Telegram.',
            panelEyebrow: 'Что дальше',
            panelTitle: 'Все понятно с первого шага',
            panelItems: [
                'Получаем заявку и быстро связываемся',
                'Показываем короткое демо и подбираем подходящий тариф',
                'Открываем доступ и помогаем уверенно начать работу',
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
            directTelegram: 'Написать в Telegram',
            telegramPrompt: 'Хочу узнать подробнее об Identa',
        },
        faq: {
            eyebrow: 'Вопросы',
            title: 'Короткие ответы на главное',
            items: [
                {
                    question: 'Как получить доступ к системе?',
                    answer: 'Оставляете заявку на сайте или пишете в Telegram. После короткого знакомства открываем доступ.',
                },
                {
                    question: 'Есть ли пробный период?',
                    answer: 'Да. Систему можно проверить 30 дней на реальной работе клиники.',
                },
                {
                    question: 'Работает ли система на телефоне?',
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
            description: 'Оставьте заявку или войдите, если доступ уже открыт.',
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
            title: 'Appointments, patients, and payments stay organized in one system',
            description:
                'Identa keeps the daily clinic workflow clear: scheduling, patient records, treatment history, and payment control all stay in one place.',
            primary: 'Request access',
            secondary: 'Sign in',
            chips: ['30-day trial', '3 pricing plans', 'Telegram contact'],
            previewEyebrow: 'Inside Identa',
            previewTitle: 'A workflow that feels ready at first glance',
            previewDescription:
                'The core clinic actions stay visible, structured, and easy to continue without extra switching.',
            previewStatus: 'Today',
            metrics: [
                { label: 'Appointments today', value: '8', hint: 'Daily schedule ready' },
                { label: 'Active patients', value: '126', hint: 'Records within reach' },
                { label: 'Pending payments', value: '4.8M UZS', hint: 'Debt control stays visible' },
            ],
            timelineTitle: 'Today workflow',
            timeline: [
                {
                    time: '09:00',
                    title: 'Checkup visit',
                    note: 'The patient record and treatment history open right away',
                },
                {
                    time: '10:30',
                    title: 'Whitening',
                    note: 'Previous notes and images stay attached to the patient',
                },
                {
                    time: '12:00',
                    title: 'Payment review',
                    note: 'Paid and pending amounts are visible at a glance',
                },
            ],
            details: [
                {
                    title: 'Patient record stays open',
                    description: 'Notes, images, and odontogram data stay together.',
                },
                {
                    title: 'Payments stay under control',
                    description: 'Debts and incoming amounts remain easy to track.',
                },
            ],
        },
        benefits: {
            eyebrow: 'Why Identa',
            title: 'Three reasons clinics choose it first',
            description: 'If clean workflow, speed, and visibility matter most, Identa covers the essentials without extra noise.',
            items: [
                {
                    title: 'Scheduling stays clear',
                    description: 'Run daily and weekly appointments without confusion.',
                },
                {
                    title: 'Patient records stay together',
                    description: 'History, odontogram, notes, and images stay in one place.',
                },
                {
                    title: 'Payments stay visible',
                    description: 'See what was paid and what is still pending right away.',
                },
            ],
        },
        plans: {
            eyebrow: 'Plans',
            title: 'Three pricing options with clear differences',
            description: 'Choose by duration, assistant limits, and renewal logic without guessing.',
            freePrice: 'Free',
            teamCaption: 'Team',
            renewalCaption: 'Renewal',
            items: [
                {
                    key: 'trial',
                    title: 'Trial period',
                    badge: '30 days',
                    description: 'A starter option for testing the system in a real clinic workflow.',
                    periodLabel: null,
                    seatLabel: 'Up to 1 assistant',
                    renewalLabel: 'A paid plan is chosen after the trial',
                    bullets: [
                        'Core modules included',
                        'Enough to start and evaluate calmly',
                        'Good for the first real check',
                    ],
                },
                {
                    key: 'monthly',
                    title: 'Monthly plan',
                    badge: 'Monthly',
                    description: 'A flexible option for active private practice and daily operations.',
                    periodLabel: '/ month',
                    seatLabel: 'Up to 3 assistants',
                    renewalLabel: 'Renews every month',
                    bullets: [
                        'Full working access',
                        'Appointments, patients, and payments included',
                        'Good when flexibility matters',
                    ],
                },
                {
                    key: 'yearly',
                    title: 'Yearly plan',
                    badge: 'Yearly',
                    description: 'A longer-term format for stable clinics with consistent workload.',
                    periodLabel: '/ year',
                    seatLabel: 'Up to 5 assistants',
                    renewalLabel: 'Renews once a year',
                    bullets: [
                        'Full working access',
                        'Comfortable for long-term use',
                        'Better for a larger team',
                    ],
                },
            ],
        },
        request: {
            title: 'Request a demo or clinic access',
            description: 'Send the form on the site or contact us directly on Telegram.',
            panelEyebrow: 'Next steps',
            panelTitle: 'Simple from the first touch',
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
            directTelegram: 'Write on Telegram',
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
            title: 'Ready to make clinic work feel cleaner?',
            description: 'Send a request or sign in if you already have access.',
            primary: 'Request access',
            secondary: 'Sign in',
        },
        footer: '(c) 2026 Identa. Built for private dentists and small clinics.',
    },
};

const BENEFIT_ICONS = [CalendarDays, Stethoscope, CreditCard] as const;

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
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.08),_transparent_22%),linear-gradient(180deg,#f6f9ff_0%,#ffffff_42%,#f8fbff_100%)] text-slate-950">
            <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.7)]">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xl font-semibold tracking-tight text-slate-950">Identa</p>
                        </div>
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
                        <Button asChild variant="outline" className="hidden rounded-xl sm:inline-flex">
                            <Link href="/login">{content.nav.signIn}</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative">
                    <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.14),transparent_32%),radial-gradient(circle_at_80%_15%,rgba(14,165,233,0.12),transparent_26%)]" />
                    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1fr_1.02fr] lg:items-stretch lg:gap-10 lg:px-8 lg:py-16">
                        <div className="relative flex flex-col justify-center">
                            <div className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-white/90 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {content.hero.badge}
                            </div>

                            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-[64px] lg:leading-[1.02]">
                                {content.hero.title}
                            </h1>
                            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                                {content.hero.description}
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                {content.hero.chips.map((chip) => (
                                    <div
                                        key={chip}
                                        className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                        {chip}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base shadow-lg shadow-slate-200">
                                    <a href="#request">
                                        {content.hero.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                                    <Link href="/login">{content.hero.secondary}</Link>
                                </Button>
                            </div>
                        </div>

                        <Card className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/96 shadow-[0_36px_120px_-52px_rgba(15,23,42,0.55)]">
                            <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(59,130,246,0.16)_0%,rgba(255,255,255,0)_100%)]" />
                            <CardContent className="relative flex h-full flex-col p-6 sm:p-7">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                                            {content.hero.previewEyebrow}
                                        </p>
                                        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                                            {content.hero.previewTitle}
                                        </h2>
                                        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                                            {content.hero.previewDescription}
                                        </p>
                                    </div>
                                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                                        {content.hero.previewStatus}
                                    </span>
                                </div>

                                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                    {content.hero.metrics.map((metric, index) => {
                                        const Icon = index === 0 ? CalendarDays : index === 1 ? Users : CreditCard;

                                        return (
                                            <div
                                                key={metric.label}
                                                className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 p-4 shadow-sm"
                                            >
                                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                    {metric.label}
                                                </p>
                                                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                                                    {metric.value}
                                                </p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500">{metric.hint}</p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-5 grid flex-1 gap-4 lg:grid-cols-[1.22fr_0.78fr]">
                                    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 sm:p-5">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-slate-950">{content.hero.timelineTitle}</p>
                                            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
                                                Identa
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {content.hero.timeline.map((item) => (
                                                <div
                                                    key={`${item.time}-${item.title}`}
                                                    className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white px-4 py-4 shadow-sm"
                                                >
                                                    <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                                                        {item.time}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                                                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.note}</p>
                                                    </div>
                                                    <Clock3 className="mt-1 h-4 w-4 flex-shrink-0 text-slate-400" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid gap-4">
                                        {content.hero.details.map((detail, index) => (
                                            <div
                                                key={detail.title}
                                                className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
                                            >
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                                                    {index === 0 ? (
                                                        <Stethoscope className="h-5 w-5" />
                                                    ) : (
                                                        <CreditCard className="h-5 w-5" />
                                                    )}
                                                </div>
                                                <p className="mt-4 text-base font-semibold text-slate-950">{detail.title}</p>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                                    {detail.description}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="benefits" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.benefits.eyebrow}
                        </p>
                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.benefits.title}
                        </h2>
                        <p className="mt-4 text-base leading-7 text-slate-600">{content.benefits.description}</p>
                    </div>

                    <div className="mt-10 grid gap-4 md:grid-cols-3">
                        {content.benefits.items.map((item, index) => {
                            const Icon = BENEFIT_ICONS[index];

                            return (
                                <Card
                                    key={item.title}
                                    className="rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_60px_-42px_rgba(15,23,42,0.42)]"
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
                                    key={plan.key}
                                    className="h-full rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_-46px_rgba(15,23,42,0.42)]"
                                >
                                    <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                        <div className="flex min-h-[152px] flex-col">
                                            <div className="flex items-start justify-between gap-4">
                                                <h3 className="max-w-[220px] text-2xl font-semibold tracking-tight text-slate-950">
                                                    {plan.title}
                                                </h3>
                                                <span className="inline-flex min-h-10 min-w-[102px] items-center justify-center rounded-full bg-slate-950 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                                    {plan.badge}
                                                </span>
                                            </div>
                                            <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
                                        </div>

                                        <div className="mt-6 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7ff_100%)] p-5">
                                            <div className="flex min-h-[56px] items-end gap-2">
                                                <p className="text-4xl font-semibold tracking-tight text-slate-950">{priceText}</p>
                                                {plan.periodLabel ? (
                                                    <p className="pb-1 text-sm font-medium text-slate-500">{plan.periodLabel}</p>
                                                ) : null}
                                            </div>

                                            <div className="mt-5 space-y-3">
                                                <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                        {content.plans.teamCaption}
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold text-blue-700">{plan.seatLabel}</p>
                                                </div>
                                                <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                        {content.plans.renewalCaption}
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
                                                        {plan.renewalLabel}
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

                <section id="request" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                    <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
                        <Card className="h-full rounded-[30px] border border-slate-900 bg-slate-950 text-white shadow-[0_32px_90px_-44px_rgba(15,23,42,0.92)]">
                            <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    Identa
                                </div>

                                <div className="mt-5">
                                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                                        {content.request.panelEyebrow}
                                    </p>
                                    <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                                        {content.request.title}
                                    </h2>
                                    <p className="mt-4 text-sm leading-6 text-slate-300">{content.request.description}</p>
                                </div>

                                <div className="mt-6 flex-1 space-y-3">
                                    <p className="text-lg font-semibold text-white">{content.request.panelTitle}</p>
                                    {content.request.panelItems.map((item, index) => (
                                        <div
                                            key={item}
                                            className="flex items-start gap-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"
                                        >
                                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-sm font-semibold text-cyan-200">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-6 text-slate-200">{item}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="h-full rounded-[30px] border border-slate-200 bg-white shadow-[0_32px_90px_-46px_rgba(15,23,42,0.42)]">
                            <CardContent className="flex h-full flex-col p-6 sm:p-7">
                                <form className="flex h-full flex-col gap-4" onSubmit={handleLeadRequestSubmit}>
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

                <section id="faq" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
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
                                className="rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_48px_-36px_rgba(15,23,42,0.36)]"
                            >
                                <CardContent className="p-6">
                                    <p className="text-lg font-semibold text-slate-950">{item.question}</p>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
                                </CardContent>
                            </Card>
                        ))}
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
