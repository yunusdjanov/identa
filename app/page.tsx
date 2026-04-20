'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    CreditCard,
    FileText,
    Globe,
    MessageCircle,
    ShieldCheck,
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

interface LandingContent {
    nav: {
        product: string;
        workflow: string;
        plans: string;
        faq: string;
        signIn: string;
    };
    hero: {
        badge: string;
        title: string;
        accent: string;
        description: string;
        primary: string;
        secondary: string;
        helper: string;
        stats: Array<{ value: string; label: string }>;
    };
    preview: {
        title: string;
        summary: string;
        cards: Array<{ label: string; value: string; tone: string }>;
        queueTitle: string;
        queue: Array<{ time: string; patient: string; status: string }>;
    };
    outcomes: {
        eyebrow: string;
        title: string;
        items: Array<{ title: string; description: string }>;
    };
    workflow: {
        eyebrow: string;
        title: string;
        description: string;
        steps: Array<{ title: string; description: string }>;
    };
    plans: {
        eyebrow: string;
        title: string;
        description: string;
        items: Array<{ title: string; badge: string; description: string; bullets: string[] }>;
    };
    form: {
        badge: string;
        title: string;
        description: string;
        helper: string;
        name: string;
        phone: string;
        clinic: string;
        city: string;
        note: string;
        optional: string;
        submit: string;
        directTelegram: string;
        fixErrors: string;
        openedTelegram: string;
        copied: string;
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

interface LandingRuntimeCopy {
    requestBadge: string;
    requestTitle: string;
    requestDescription: string;
    requestHelper: string;
    formSubmit: string;
    formSubmitting: string;
    formSubmitted: string;
    formSubmitError: string;
    planFree: string;
    monthlySuffix: string;
    yearlySuffix: string;
    telegramPrompt: string;
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
            product: 'Imkoniyatlar',
            workflow: 'Qanday ishlaydi',
            plans: 'Tariflar',
            faq: 'FAQ',
            signIn: 'Kirish',
        },
        hero: {
            badge: 'Yakka stomatolog va kichik klinikalar uchun',
            title: 'Qabullar, bemorlar va',
            accent: 'to‘lov nazoratini bir tizimda boshqaring',
            description:
                "Identa xususiy stomatologiya amaliyoti uchun yaratilgan: qabul jadvali, bemor kartasi, odontogramma va davolash tarixi bir joyda ishlaydi.",
            primary: "Kirish so'rovini qoldirish",
            secondary: 'Tizimga kirish',
            helper: "Demo va ulanish Telegram orqali. Ochiq registratsiya yo'q.",
            stats: [
                { value: '30 kun', label: 'free trial' },
                { value: '3 til', label: 'UZ / RU / EN' },
                { value: 'Responsive', label: 'telefon, planshet va desktop' },
            ],
        },
        preview: {
            title: 'Kunlik ish oqimi bir ekranda',
            summary: "Qabullar, bemor holati va to'lovlar tez ko'rinadi.",
            cards: [
                { label: 'Bugungi qabullar', value: '8', tone: 'bg-blue-600' },
                { label: "Kutilayotgan to'lov", value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Aktiv bemorlar', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Bugungi navbat',
            queue: [
                { time: '09:00', patient: 'Dilshod Karimov', status: 'Kontrol' },
                { time: '10:30', patient: 'Madina Rustamova', status: 'Whitening' },
            ],
        },
        outcomes: {
            eyebrow: 'Nimani hal qiladi',
            title: 'Klinika uchun eng kerakli natijalar',
            items: [
                {
                    title: "Bemorlar tartibda bo'ladi",
                    description: "Kartalar, tarix va rasmlar tartibli saqlanadi.",
                },
                {
                    title: "Qabullar boshqariladi",
                    description: "Kunlik va haftalik jadvalni tez to'ldirib, ko'rish mumkin.",
                },
                {
                    title: "To'lovlar ko'rinadi",
                    description: "Kim qancha to'lagani va qancha qolganini bir qarashda ko'rasiz.",
                },
                {
                    title: 'Davolash tarixi bir joyda',
                    description: "Odontogramma, yozuvlar va rasmlar bitta bemor kartasiga jamlanadi.",
                },
                {
                    title: 'Har qurilmada qulay',
                    description: "Telefon, planshet va desktopda bir xil qulay ishlash uchun moslangan.",
                },
            ],
        },
        workflow: {
            eyebrow: 'Qanday boshlanadi',
            title: 'Boshlash oddiy',
            description: "Telegram orqali so'rov qoldirasiz, qisqa demo olasiz va access ochiladi.",
            steps: [
                {
                    title: "1. So'rov qoldirasiz",
                    description: "Ism, telefon va klinika ma'lumotini yuborasiz.",
                },
                {
                    title: '2. Demo va onboarding',
                    description: "Qisqa demo ko'rsatamiz va mos tarifni tanlashga yordam beramiz.",
                },
                {
                    title: '3. Access ochiladi',
                    description: "Akkaunt ochiladi va ishni boshlaysiz.",
                },
            ],
        },
        plans: {
            eyebrow: 'Tariflar',
            title: 'Boshlash uchun 3 oddiy variant',
            description: "Avval trial bilan ko'rasiz, keyin klinikangizga mos tarifni tanlaysiz.",
            items: [
                {
                    title: 'Free trial',
                    badge: '30 kun',
                    description: "Tizimni real ish jarayonida sinab ko'rish uchun.",
                    bullets: ['Asosiy modullar ochiq', 'Tez onboarding', "Klinika ichida sinab ko'rish"],
                },
                {
                    title: 'Oylik paket',
                    badge: 'Monthly',
                    description: 'Faol ishlayotgan xususiy amaliyot uchun qulay variant.',
                    bullets: ["Qabullar va bemorlar", "To'lov nazorati", 'Kunlik ishlash uchun qulay'],
                },
                {
                    title: 'Yillik paket',
                    badge: 'Yearly',
                    description: 'Barqaror klinikalar uchun uzoq muddatli format.',
                    bullets: ['Uzoqroq muddat', 'Boshqarish oson', 'Klinika uchun qulayroq'],
                },
            ],
        },
        form: {
            badge: 'Telegram orqali boshlaymiz',
            title: "Demo yoki access so'rovi qoldiring",
            description: "Ism, telefon va klinika nomini qoldiring. Email shart emas.",
            helper: "Telegram orqali tez bog'lanamiz va keyingi qadamlarni yozamiz.",
            name: 'Ism',
            phone: 'Telefon',
            clinic: 'Klinika nomi',
            city: 'Shahar',
            note: 'Izoh',
            optional: 'ixtiyoriy',
            submit: 'Telegramda yuborish',
            directTelegram: "Telegramga o'tish",
            fixErrors: "Majburiy maydonlarni to'g'rilang.",
            openedTelegram: 'Telegram oynasi ochildi.',
            copied: "So'rov matni nusxalandi.",
        },
        faq: {
            eyebrow: 'FAQ',
            title: 'Asosiy savollarga qisqa javob',
            items: [
                {
                    question: "Ro'yxatdan o'tish bormi?",
                    answer: "Yo'q. Public sign-up yo'q, access so'rov bo'yicha ochiladi.",
                },
                {
                    question: 'Trial bormi?',
                    answer: "Ha. Trial orqali tizimni klinika ish jarayonida ko'rib chiqish mumkin.",
                },
                {
                    question: 'Telefon orqali ham ishlaydimi?',
                    answer: 'Ha. Landing ham, product ham mobile, tablet va desktop uchun moslangan.',
                },
                {
                    question: "Qanday bog'lansam bo'ladi?",
                    answer: "Telegram orqali so'rov qoldirasiz, keyin demo va ulanish bo'yicha bog'lanamiz.",
                },
            ],
        },
        finalCta: {
            title: 'Klinikangizni tartibli raqamlashtirishga tayyormisiz?',
            description: "Telegram orqali bog'laning yoki mavjud akkaunt bilan tizimga kiring.",
            primary: "So'rov yuborish",
            secondary: 'Kirish',
        },
        footer: "(c) 2026 Identa. O'zbekistondagi xususiy stomatologlar uchun yaratilgan.",
    },
    ru: {
        nav: {
            product: 'Возможности',
            workflow: 'Как это работает',
            plans: 'Тарифы',
            faq: 'FAQ',
            signIn: 'Войти',
        },
        hero: {
            badge: 'Для частных стоматологов и небольших клиник',
            title: 'Управляйте записями, пациентами и',
            accent: 'контролем оплат в одной системе',
            description:
                'Identa создана для частной стоматологической практики: расписание, карта пациента, одонтограмма и история лечения работают в одном месте.',
            primary: 'Оставить запрос на доступ',
            secondary: 'Войти в систему',
            helper: 'Демо и подключение идут через Telegram. Открытой регистрации нет.',
            stats: [
                { value: '30 дней', label: 'free trial' },
                { value: '3 языка', label: 'RU / UZ / EN' },
                { value: 'Responsive', label: 'телефон, планшет и desktop' },
            ],
        },
        preview: {
            title: 'Ежедневный рабочий поток в одном окне',
            summary: 'Записи, пациент и платежи видны без лишних переходов.',
            cards: [
                { label: 'Записи сегодня', value: '8', tone: 'bg-blue-600' },
                { label: 'Ожидается к оплате', value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Активные пациенты', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Очередь на сегодня',
            queue: [
                { time: '09:00', patient: 'Дильшод Каримов', status: 'Контроль' },
                { time: '10:30', patient: 'Мадина Рустамова', status: 'Whitening' },
            ],
        },
        outcomes: {
            eyebrow: 'Что это решает',
            title: 'Самое важное для клиники',
            items: [
                {
                    title: 'Пациенты в порядке',
                    description: 'Карты, история и изображения хранятся в одном аккуратном месте.',
                },
                {
                    title: 'Расписание под контролем',
                    description: 'Дневной и недельный календарь заполняется быстро и без путаницы.',
                },
                {
                    title: 'Оплаты видны сразу',
                    description: 'Сразу видно, что оплачено и что осталось к закрытию.',
                },
                {
                    title: 'История лечения рядом',
                    description: 'Одонтограмма, записи и изображения собраны внутри карты пациента.',
                },
                {
                    title: 'Работает на любом устройстве',
                    description: 'Интерфейс адаптирован для телефона, планшета и десктопа.',
                },
            ],
        },
        workflow: {
            eyebrow: 'Как начинается работа',
            title: 'Старт без лишних шагов',
            description: 'Оставляете заявку в Telegram, смотрите короткое демо и получаете доступ.',
            steps: [
                {
                    title: '1. Оставляете запрос',
                    description: 'Заполняете имя, телефон и данные клиники.',
                },
                {
                    title: '2. Демо и онбординг',
                    description: 'Показываем систему и помогаем выбрать подходящий тариф.',
                },
                {
                    title: '3. Открываем доступ',
                    description: 'Открываем аккаунт и можно начинать работу.',
                },
            ],
        },
        plans: {
            eyebrow: 'Тарифы',
            title: 'Три понятных варианта старта',
            description: 'Сначала пробуете trial, затем выбираете формат, который подходит вашей клинике.',
            items: [
                {
                    title: 'Free trial',
                    badge: '30 дней',
                    description: 'Чтобы протестировать систему в реальном процессе клиники.',
                    bullets: ['Открыты основные модули', 'Быстрый онбординг', 'Удобный старт без лишней сложности'],
                },
                {
                    title: 'Месячный тариф',
                    badge: 'Monthly',
                    description: 'Удобный вариант для активно работающей частной практики.',
                    bullets: ['Записи и пациенты', 'Контроль оплат', 'Комфортная ежедневная работа'],
                },
                {
                    title: 'Годовой тариф',
                    badge: 'Yearly',
                    description: 'Формат для стабильных клиник с долгим горизонтом работы.',
                    bullets: ['Долгий период', 'Простое продление', 'Удобно для клиники'],
                },
            ],
        },
        form: {
            badge: 'Стартуем через Telegram',
            title: 'Оставьте запрос на демо или доступ',
            description: 'Оставьте имя, телефон и название клиники. Email не обязателен.',
            helper: 'После заявки быстро продолжаем общение в Telegram.',
            name: 'Имя',
            phone: 'Телефон',
            clinic: 'Название клиники',
            city: 'Город',
            note: 'Комментарий',
            optional: 'необязательно',
            submit: 'Отправить в Telegram',
            directTelegram: 'Открыть Telegram',
            fixErrors: 'Исправьте обязательные поля.',
            openedTelegram: 'Окно Telegram открыто.',
            copied: 'Текст заявки скопирован.',
        },
        faq: {
            eyebrow: 'FAQ',
            title: 'Коротко о главном',
            items: [
                {
                    question: 'Есть ли открытая регистрация?',
                    answer: 'Нет. Public sign-up нет, доступ открывается по запросу.',
                },
                {
                    question: 'Есть ли trial?',
                    answer: 'Да. Можно начать с trial и посмотреть систему в реальной работе клиники.',
                },
                {
                    question: 'Работает ли с телефона?',
                    answer: 'Да. И landing, и продукт адаптированы под мобильный, планшет и desktop.',
                },
                {
                    question: 'Как с вами связаться?',
                    answer: 'Оставляете заявку через Telegram, и дальше быстро договариваемся о демо и подключении.',
                },
            ],
        },
        finalCta: {
            title: 'Готовы навести порядок в клинике?',
            description: 'Свяжитесь через Telegram или войдите, если у вас уже есть аккаунт.',
            primary: 'Оставить запрос',
            secondary: 'Войти',
        },
        footer: '(c) 2026 Identa. Создано для частных стоматологов в Узбекистане.',
    },
    en: {
        nav: {
            product: 'Product',
            workflow: 'How it works',
            plans: 'Plans',
            faq: 'FAQ',
            signIn: 'Sign in',
        },
        hero: {
            badge: 'Built for solo dentists and small clinics',
            title: 'Run appointments, patients, and',
            accent: 'payment control in one system',
            description:
                'Identa is built for private dental practice: scheduling, patient records, odontogram, and treatment history all work in one place.',
            primary: 'Request access',
            secondary: 'Sign in',
            helper: 'Demo and onboarding happen through Telegram. There is no public self-signup.',
            stats: [
                { value: '30 days', label: 'free trial' },
                { value: '3 languages', label: 'UZ / RU / EN' },
                { value: 'Responsive', label: 'phone, tablet, and desktop' },
            ],
        },
        preview: {
            title: 'Daily workflow in one view',
            summary: 'Appointments, patient status, and payments stay visible without extra clicks.',
            cards: [
                { label: 'Today appointments', value: '8', tone: 'bg-blue-600' },
                { label: 'Pending revenue', value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Active patients', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Today queue',
            queue: [
                { time: '09:00', patient: 'Dilshod Karimov', status: 'Checkup' },
                { time: '10:30', patient: 'Madina Rustamova', status: 'Whitening' },
            ],
        },
        outcomes: {
            eyebrow: 'What it solves',
            title: 'What matters most for a clinic',
            items: [
                {
                    title: 'Patients stay organized',
                    description: 'Records, history, and images stay in one structured place.',
                },
                {
                    title: 'Scheduling stays manageable',
                    description: 'Daily and weekly calendars are easier to fill and review.',
                },
                {
                    title: 'Payments stay visible',
                    description: 'You can quickly see what was paid and what is still pending.',
                },
                {
                    title: 'Treatment history stays together',
                    description: 'The odontogram, notes, and images remain attached to the patient record.',
                },
                {
                    title: 'Works on every device',
                    description: 'Optimized for phone, tablet, and desktop workflows.',
                },
            ],
        },
        workflow: {
            eyebrow: 'How it starts',
            title: 'A simple start',
            description: 'Send a Telegram request, get a short demo, and receive access.',
            steps: [
                {
                    title: '1. Send a request',
                    description: 'Leave your name, phone number, and clinic details.',
                },
                {
                    title: '2. Demo and onboarding',
                    description: 'We show the product and help you choose the right plan.',
                },
                {
                    title: '3. Access is opened',
                    description: 'Your account is created and you can start working.',
                },
            ],
        },
        plans: {
            eyebrow: 'Plans',
            title: 'Three simple ways to start',
            description: 'Start with a trial, then choose the format that fits your clinic best.',
            items: [
                {
                    title: 'Free trial',
                    badge: '30 days',
                    description: 'A quick way to evaluate the workflow inside a real clinic process.',
                    bullets: ['Core modules included', 'Fast onboarding', 'Easy way to test the product'],
                },
                {
                    title: 'Monthly plan',
                    badge: 'Monthly',
                    description: 'A practical option for clinics already working actively.',
                    bullets: ['Appointments and patients', 'Payment control', 'Comfortable day-to-day use'],
                },
                {
                    title: 'Yearly plan',
                    badge: 'Yearly',
                    description: 'A smoother long-term format for stable clinics.',
                    bullets: ['Longer period', 'Simple renewals', 'Convenient for stable clinics'],
                },
            ],
        },
        form: {
            badge: 'Start with Telegram',
            title: 'Request a demo or access',
            description: 'Leave your name, phone number, and clinic name. Email is not required.',
            helper: 'After the request is sent, we continue the conversation in Telegram.',
            name: 'Name',
            phone: 'Phone',
            clinic: 'Clinic name',
            city: 'City',
            note: 'Message',
            optional: 'optional',
            submit: 'Send via Telegram',
            directTelegram: 'Open Telegram',
            fixErrors: 'Please fix the required fields.',
            openedTelegram: 'Telegram has been opened.',
            copied: 'Request message copied.',
        },
        faq: {
            eyebrow: 'FAQ',
            title: 'Quick answers to the main questions',
            items: [
                {
                    question: 'Is there open registration?',
                    answer: 'No. There is no public self-signup; access is issued on request.',
                },
                {
                    question: 'Is there a trial?',
                    answer: 'Yes. You can start with a trial and evaluate the system inside the clinic workflow.',
                },
                {
                    question: 'Does it work on mobile?',
                    answer: 'Yes. Both the landing page and the product are adapted for phone, tablet, and desktop.',
                },
                {
                    question: 'How do I contact you?',
                    answer: 'Leave a Telegram request and we will follow up quickly with demo and onboarding details.',
                },
            ],
        },
        finalCta: {
            title: 'Ready to bring order to your clinic?',
            description: 'Start the conversation in Telegram or sign in if your account already exists.',
            primary: 'Send request',
            secondary: 'Sign in',
        },
        footer: '(c) 2026 Identa. Built for private dental practices in Uzbekistan.',
    },
};

const LANDING_RUNTIME_COPY: Record<LandingLocale, LandingRuntimeCopy> = {
    uz: {
        requestBadge: "Super-adminga so'rov yuborish",
        requestTitle: "Demo yoki ulanish so'rovini qoldiring",
        requestDescription:
            "Forma orqali yuborilgan so'rov super-adminga tushadi. Xohlasangiz alohida Telegram orqali ham bog'lanishingiz mumkin.",
        requestHelper:
            "Email shart emas. So'rovdan keyin siz bilan bog'lanib, demo, trial va ulanish jarayonini tushuntiramiz.",
        formSubmit: "So'rov yuborish",
        formSubmitting: 'Yuborilmoqda...',
        formSubmitted: "So'rov yuborildi. Tez orada siz bilan bog'lanamiz.",
        formSubmitError: "So'rovni yuborib bo'lmadi. Qayta urinib ko'ring.",
        planFree: 'Bepul',
        monthlySuffix: '/ oy',
        yearlySuffix: '/ yil',
        telegramPrompt: "Identa haqida ma'lumot olmoqchiman",
    },
    ru: {
        requestBadge: 'Заявка для супер-админа',
        requestTitle: 'Оставьте заявку на демо или подключение',
        requestDescription:
            'Заявка из формы попадает супер-админу. Если удобнее, можно сразу написать в Telegram.',
        requestHelper:
            'Email не обязателен. После заявки мы связываемся, показываем демо и открываем доступ.',
        formSubmit: 'Отправить заявку',
        formSubmitting: 'Отправка...',
        formSubmitted: 'Заявка отправлена. Мы скоро свяжемся с вами.',
        formSubmitError: 'Не удалось отправить заявку. Попробуйте ещё раз.',
        planFree: 'Бесплатно',
        monthlySuffix: '/ месяц',
        yearlySuffix: '/ год',
        telegramPrompt: 'Хочу узнать подробнее об Identa',
    },
    en: {
        requestBadge: 'Request access from the super admin',
        requestTitle: 'Request a demo or clinic access',
        requestDescription:
            'Form submissions go directly to the super admin. If you prefer, you can also contact us in Telegram.',
        requestHelper:
            'Email is not required. After the request, we follow up, show the demo, and arrange onboarding.',
        formSubmit: 'Send request',
        formSubmitting: 'Sending...',
        formSubmitted: 'Request sent. We will contact you shortly.',
        formSubmitError: 'Could not send the request. Please try again.',
        planFree: 'Free',
        monthlySuffix: '/ month',
        yearlySuffix: '/ year',
        telegramPrompt: 'I want to learn more about Identa',
    },
};

const OUTCOME_ICONS = [Stethoscope, CalendarDays, CreditCard, FileText, Globe] as const;

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
            // Fall back to the standard share flow below.
        }
    }

    const shareUrl = new URL('https://t.me/share/url');
    shareUrl.searchParams.set('url', SITE_URL);
    shareUrl.searchParams.set('text', message);
    return shareUrl.toString();
}

function buildTelegramMessage(copy: LandingContent, form: LandingFormState): string {
    const lines = [
        'Identa access request',
        `${copy.form.name}: ${form.name.trim()}`,
        `${copy.form.phone}: ${form.phone.trim()}`,
        `${copy.form.clinic}: ${form.clinicName.trim()}`,
        `${copy.form.city}: ${form.city.trim()}`,
    ];

    if (form.note.trim()) {
        lines.push(`${copy.form.note}: ${form.note.trim()}`);
    }

    return lines.join('\n');
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

function formatPlanPrice(
    amount: number,
    currency: string,
    locale: LandingLocale,
    runtimeCopy: LandingRuntimeCopy
): string {
    if (amount <= 0) {
        return runtimeCopy.planFree;
    }

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

export default function LandingPage() {
    const { locale } = useI18n();
    const landingLocale = (locale as LandingLocale) ?? 'en';
    const content = LANDING_CONTENT[landingLocale] ?? LANDING_CONTENT.en;
    const runtimeCopy = LANDING_RUNTIME_COPY[landingLocale] ?? LANDING_RUNTIME_COPY.en;
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
            toast.success(runtimeCopy.formSubmitted);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, runtimeCopy.formSubmitError));
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

    const directTelegramMessage = hasErrors
        ? runtimeCopy.telegramPrompt
        : buildTelegramMessage(content, form);

    return (
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f5f8ff_100%)] text-slate-950">
            <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-blue-200/70">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-lg font-semibold tracking-tight text-slate-950">Identa</p>
                            <p className="text-xs text-slate-500">{content.hero.badge}</p>
                        </div>
                    </div>

                    <nav className="hidden items-center gap-6 lg:flex">
                        <a href="#product" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.product}
                        </a>
                        <a href="#workflow" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.workflow}
                        </a>
                        <a href="#plans" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.plans}
                        </a>
                        <a href="#faq" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                            {content.nav.faq}
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
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12 lg:px-8 lg:py-16">
                        <div className="space-y-8">
                            <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {content.hero.badge}
                            </div>

                            <div className="space-y-5">
                                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                                    {content.hero.title}{' '}
                                    <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-emerald-600 bg-clip-text text-transparent">
                                        {content.hero.accent}
                                    </span>
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                                    {content.hero.description}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                                    <a href="#access-request">
                                        {content.hero.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
                                    <Link href="/login">{content.hero.secondary}</Link>
                                </Button>
                            </div>

                            <p className="text-sm leading-6 text-slate-500">{content.hero.helper}</p>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {content.hero.stats.map((stat) => (
                                    <Card key={stat.label} className="rounded-2xl border-slate-200/80 bg-white/80 shadow-sm">
                                        <CardContent className="space-y-1 p-5">
                                            <p className="text-2xl font-semibold text-slate-950">{stat.value}</p>
                                            <p className="text-sm text-slate-500">{stat.label}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-x-10 -top-4 h-36 rounded-full bg-blue-200/30 blur-3xl" />
                            <Card className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.55)]">
                                <CardContent className="p-5 sm:p-6">
                                    <div className="mb-6 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                                                {content.preview.title}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">{content.preview.summary}</p>
                                        </div>
                                        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                                            Identa
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {content.preview.cards.map((card) => (
                                            <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className={`mb-3 h-2 w-16 rounded-full ${card.tone}`} />
                                                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
                                                <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                                        <div className="mb-4 flex items-center justify-between">
                                            <p className="text-sm font-semibold text-slate-900">{content.preview.queueTitle}</p>
                                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                                                Live
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {content.preview.queue.map((item) => (
                                                <div
                                                    key={`${item.time}-${item.patient}`}
                                                    className="flex items-center justify-between gap-3 rounded-2xl border border-white bg-white p-3 shadow-sm"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                                                            {item.time}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{item.patient}</p>
                                                            <p className="text-xs text-slate-500">{item.status}</p>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>

                <section id="access-request" className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
                        <Card className="rounded-[28px] border-slate-200 bg-slate-950 text-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.9)]">
                            <CardContent className="p-6 sm:p-8">
                                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    {runtimeCopy.requestBadge}
                                </div>
                                <h2 className="mt-5 text-3xl font-semibold tracking-tight">{runtimeCopy.requestTitle}</h2>
                                <p className="mt-4 text-sm leading-6 text-slate-300">{runtimeCopy.requestDescription}</p>
                                <p className="mt-3 text-sm leading-6 text-slate-400">{runtimeCopy.requestHelper}</p>
                                <div className="mt-6 space-y-3">
                                    {content.workflow.steps.map((step) => (
                                        <div key={step.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
                                            <div>
                                                <p className="text-sm font-medium text-white">{step.title}</p>
                                                <p className="mt-1 text-sm text-slate-300">{step.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[28px] border-slate-200 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.4)]">
                            <CardContent className="p-6 sm:p-8">
                                <form className="space-y-5" onSubmit={handleLeadRequestSubmit}>
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
                                            {content.form.note}{' '}
                                            <span className="text-slate-400">({content.form.optional})</span>
                                        </label>
                                        <Textarea
                                            value={form.note}
                                            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                                            maxLength={INPUT_LIMITS.longText}
                                            aria-invalid={Boolean(isSubmitted && errors.note)}
                                            placeholder={content.form.note}
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
                                            {leadRequestMutation.isPending ? runtimeCopy.formSubmitting : runtimeCopy.formSubmit}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <Button asChild type="button" size="lg" variant="outline" className="h-12 rounded-xl px-5">
                                            <a
                                                href={buildTelegramHref(
                                                    directTelegramMessage,
                                                    landingSettings.telegram_contact_url
                                                )}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {content.form.directTelegram}
                                            </a>
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="product" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
                    <div className="space-y-4 text-center">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.outcomes.eyebrow}
                        </p>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.outcomes.title}
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {content.outcomes.items.map((item, index) => {
                            const Icon = OUTCOME_ICONS[index];
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

                <section id="workflow" className="border-y border-slate-200/70 bg-slate-50/80">
                    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
                        <div className="max-w-3xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                                {content.workflow.eyebrow}
                            </p>
                            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                                {content.workflow.title}
                            </h2>
                            <p className="mt-4 text-base leading-7 text-slate-600">{content.workflow.description}</p>
                        </div>
                        <div className="mt-10 grid gap-4 lg:grid-cols-3">
                            {content.workflow.steps.map((step) => (
                                <Card key={step.title} className="rounded-[24px] border-slate-200 bg-white shadow-sm">
                                    <CardContent className="p-6">
                                        <p className="text-lg font-semibold text-slate-950">{step.title}</p>
                                        <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="plans" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
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
                        {content.plans.items.map((plan, index) => {
                            const planKey = (['trial', 'monthly', 'yearly'] as const)[index];
                            const planAmount = getPlanAmount(landingSettings, planKey);
                            const planPrice = formatPlanPrice(
                                planAmount,
                                landingSettings.currency,
                                landingLocale,
                                runtimeCopy
                            );
                            const billingSuffix =
                                planKey === 'monthly'
                                    ? runtimeCopy.monthlySuffix
                                    : planKey === 'yearly'
                                      ? runtimeCopy.yearlySuffix
                                      : null;

                            return (
                            <Card
                                key={plan.title}
                                className="rounded-[28px] border-slate-200 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.4)]"
                            >
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-xl font-semibold text-slate-950">{plan.title}</h3>
                                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                            {plan.badge}
                                        </span>
                                    </div>
                                    <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
                                    <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
                                        <p className="text-3xl font-semibold tracking-tight text-slate-950">{planPrice}</p>
                                        {billingSuffix ? (
                                            <p className="mt-1 text-sm font-medium text-slate-500">{billingSuffix}</p>
                                        ) : null}
                                    </div>
                                    <div className="mt-5 space-y-3">
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

                <section id="faq" className="bg-slate-950 text-white">
                    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
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

                <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
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
                                    <a href="#access-request">
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
                            href={buildTelegramHref(runtimeCopy.telegramPrompt, landingSettings.telegram_contact_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="transition hover:text-slate-900"
                        >
                            {content.form.directTelegram}
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
