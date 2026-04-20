'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    CreditCard,
    Globe,
    Lock,
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
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getPhoneValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://identa.uz';
const TELEGRAM_CONTACT_URL = process.env.NEXT_PUBLIC_TELEGRAM_CONTACT_URL?.trim();

type LandingLocale = 'ru' | 'uz' | 'en';

interface LandingFormState {
    name: string;
    phone: string;
    clinicName: string;
    city: string;
    note: string;
}

const LANDING_CONTENT: Record<
    LandingLocale,
    {
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
            cards: Array<{ label: string; value: string; tone: string }>;
            queueTitle: string;
            queue: Array<{ time: string; patient: string; status: string }>;
            summary: string;
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
> = {
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
            accent: 'qarzdorlikni bir tizimda boshqaring',
            description:
                "Identa xususiy stomatologiya amaliyoti uchun yaratilgan: bemor kartasi, odontogramma, treatment history, to'lovlar va staff kirishini bitta tushunarli oqimga jamlaydi.",
            primary: "Kirish so'rovini qoldirish",
            secondary: 'Tizimga kirish',
            helper: "Ochiq registratsiya yo'q. Access onboarding va superadmin orqali ochiladi.",
            stats: [
                { value: '30 kun', label: 'free trial' },
                { value: '3 til', label: 'UZ / RU / EN' },
                { value: 'Read-only', label: 'muddat tugasa ham ma’lumot saqlanadi' },
            ],
        },
        preview: {
            title: 'Bir qarashda kunlik ish oqimi',
            cards: [
                { label: 'Bugungi qabullar', value: '8', tone: 'bg-blue-600' },
                { label: "Kutilayotgan to'lov", value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Aktiv bemorlar', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Bugungi navbat',
            queue: [
                { time: '09:00', patient: 'Dilshod Karimov', status: 'Kontrol' },
                { time: '10:30', patient: 'Madina Rustamova', status: 'Whitening' },
                { time: '12:00', patient: 'Sardor Ergashev', status: 'Implant konsultatsiya' },
            ],
            summary: "Bemor ma'lumoti, odontogramma va to'lov holati bir sahifada ko'rinadi.",
        },
        outcomes: {
            eyebrow: 'Nimani hal qiladi',
            title: 'Landing savollariga qisqa javob: Identa nimaga kerak?',
            items: [
                {
                    title: "Bemorlarni yo'qotmaysiz",
                    description: "Kartalar, tarix, treatment yozuvlari va rasmlar tartibli saqlanadi.",
                },
                {
                    title: "Qabullar boshqariladigan bo'ladi",
                    description: "Kunlik va haftalik jadval chalkashmasdan, tez to'ldiriladi va ko'riladi.",
                },
                {
                    title: 'Qarz va to‘lov ko‘rinadi',
                    description: "Kim qancha to'lagani va qancha qolganini bir qarashda ko'rasiz.",
                },
                {
                    title: 'Staff access nazoratda bo‘ladi',
                    description: "Assistentlarga kerakli ruxsatlar beriladi, ortiqcha imkoniyat ochilmaydi.",
                },
                {
                    title: 'Muddat tugasa ish to‘xtab qolmaydi',
                    description: "Subscription tugaganda ham read-only rejim orqali ma'lumotlaringizni ko'rishda davom etasiz.",
                },
                {
                    title: 'Har joydan ishlaydi',
                    description: "Telefon, planshet va desktopda bir xil qulay ishlash uchun optimallashtirilgan.",
                },
            ],
        },
        workflow: {
            eyebrow: 'Qanday boshlanadi',
            title: 'Self-signup o‘rniga boshqariladigan onboarding',
            description:
                "Identa da ommaviy registratsiya yo'q. Bu klinikalarni tartibli ulash, trial berish va access nazoratini soddalashtiradi.",
            steps: [
                {
                    title: "1. So'rov qoldirasiz",
                    description: "Ism, telefon va klinika ma'lumotini qoldirasiz. Telegram orqali tez bog'lanamiz.",
                },
                {
                    title: '2. Demo va onboarding',
                    description: "Jarayon, tarif va trial bo'yicha qisqa demo qilinadi.",
                },
                {
                    title: '3. Access ochiladi',
                    description: "Superadmin akkauntni yaratadi, kerak bo'lsa staff va trial darrov ulab beradi.",
                },
            ],
        },
        plans: {
            eyebrow: 'Tarif mantiqi',
            title: 'Registratsiya emas, access provisioning',
            description:
                "Akkauntlar qo'lda ochiladi. Bu sizga trial, oylik va yillik paketlarni nazorat bilan ulash imkonini beradi.",
            items: [
                {
                    title: 'Free trial',
                    badge: '30 kun',
                    description: "Tizimni real ish jarayonida ko'rib chiqish uchun sinov davri.",
                    bullets: ['Asosiy modullar ochiq', 'Onboarding bilan boshlanadi', "Trial tugaganda read-only qo'llanadi"],
                },
                {
                    title: 'Oylik paket',
                    badge: 'Monthly',
                    description: 'Aktiv ishlayotgan xususiy amaliyot uchun mos variant.',
                    bullets: ["Bemorlar va qabullar oqimi", "To'lov nazorati", 'Staff limit bilan boshqaruv'],
                },
                {
                    title: 'Yillik paket',
                    badge: 'Yearly',
                    description: 'Barqaror klinikalar uchun uzoqroq va qulayroq ulanish formati.',
                    bullets: ['Uzoq muddatli ishlatish', 'Subscription uzaytirish oson', 'Superadmin orqali boshqariladi'],
                },
            ],
        },
        form: {
            badge: 'Telegram orqali boshlaymiz',
            title: "Kirish uchun so'rov qoldiring",
            description:
                "Formani to'ldirsangiz, Telegram uchun tayyor matn ochiladi. Email shart emas.",
            helper: "So'rov yuborilgach, Telegram orqali tez bog'lanamiz va onboardingni boshlaymiz.",
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
            copied: 'So‘rov matni nusxalandi.',
        },
        faq: {
            eyebrow: 'Ko‘p so‘raladigan savollar',
            title: 'Landing barcha asosiy savollarga javob berishi kerak',
            items: [
                {
                    question: "Ro'yxatdan o'tish bormi?",
                    answer: "Yo'q. Identa da public sign-up yo'q. Access superadmin tomonidan ochiladi.",
                },
                {
                    question: "Demoni qanday ko'raman?",
                    answer: "Telegram orqali so'rov qoldirasiz, onboarding va demo bo'yicha bog'lanamiz.",
                },
                {
                    question: "Telefon orqali ham ishlaydimi?",
                    answer: 'Ha. Landing ham, ichki product ham mobile, tablet va desktop uchun moslangan.',
                },
                {
                    question: "Subscription tugasa nima bo'ladi?",
                    answer: "Akkaunt darrov yo'qolmaydi. Read-only rejimda ma'lumotlar ko'rinib turadi, keyin uzaytirish mumkin.",
                },
            ],
        },
        finalCta: {
            title: 'Klinikangizni tartibli raqamlashtirishga tayyormisiz?',
            description:
                "Telegram orqali bog'laning yoki existing account bilan tizimga kiring.",
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
            accent: 'задолженностями в одной системе',
            description:
                'Identa создана для частной стоматологической практики: карты пациентов, одонтограмма, история лечения, платежи и доступ сотрудников собраны в единый понятный рабочий поток.',
            primary: 'Оставить запрос на доступ',
            secondary: 'Войти в систему',
            helper: 'Открытой регистрации нет. Доступ выдается через онбординг и супер-админа.',
            stats: [
                { value: '30 дней', label: 'free trial' },
                { value: '3 языка', label: 'RU / UZ / EN' },
                { value: 'Read-only', label: 'после окончания доступ к данным сохраняется' },
            ],
        },
        preview: {
            title: 'Ежедневный рабочий поток в одном окне',
            cards: [
                { label: 'Записи сегодня', value: '8', tone: 'bg-blue-600' },
                { label: 'Ожидается к оплате', value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Активные пациенты', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Очередь на сегодня',
            queue: [
                { time: '09:00', patient: 'Дильшод Каримов', status: 'Контроль' },
                { time: '10:30', patient: 'Мадина Рустамова', status: 'Whitening' },
                { time: '12:00', patient: 'Сардор Эргашев', status: 'Консультация по импланту' },
            ],
            summary: 'Карта пациента, одонтограмма и статус оплаты видны на одной странице.',
        },
        outcomes: {
            eyebrow: 'Что это решает',
            title: 'Коротко и по делу: зачем вашей клинике Identa?',
            items: [
                {
                    title: 'Пациенты не теряются',
                    description: 'Карты, история, записи лечения и изображения хранятся в одном аккуратном месте.',
                },
                {
                    title: 'Расписание становится управляемым',
                    description: 'Дневной и недельный календарь заполняется быстро и без путаницы.',
                },
                {
                    title: 'Долги и оплаты под контролем',
                    description: 'Сразу видно, кто сколько оплатил и что осталось к закрытию.',
                },
                {
                    title: 'Права сотрудников под контролем',
                    description: 'Ассистентам выдаются только нужные разрешения без лишнего доступа.',
                },
                {
                    title: 'Работа не обрывается после окончания тарифа',
                    description: 'После завершения подписки данные остаются доступны в режиме read-only.',
                },
                {
                    title: 'Работает на любом устройстве',
                    description: 'Интерфейс адаптирован для телефона, планшета и десктопа.',
                },
            ],
        },
        workflow: {
            eyebrow: 'Как начинается работа',
            title: 'Не self-signup, а контролируемый онбординг',
            description:
                'В Identa нет массовой регистрации. Это помогает аккуратно подключать клиники, запускать trial и держать доступ под контролем.',
            steps: [
                {
                    title: '1. Оставляете запрос',
                    description: 'Заполняете имя, телефон и данные клиники. Дальше быстро связываемся через Telegram.',
                },
                {
                    title: '2. Демо и онбординг',
                    description: 'Показываем процесс работы, отвечаем на вопросы по тарифу и trial.',
                },
                {
                    title: '3. Открываем доступ',
                    description: 'Супер-админ создает аккаунт и при необходимости сразу подключает trial и сотрудников.',
                },
            ],
        },
        plans: {
            eyebrow: 'Логика тарифов',
            title: 'Не регистрация, а provisioning доступа',
            description:
                'Аккаунты создаются вручную. Это позволяет управлять trial, месячным и годовым доступом без хаоса.',
            items: [
                {
                    title: 'Free trial',
                    badge: '30 дней',
                    description: 'Тестовый период, чтобы попробовать систему в реальном процессе клиники.',
                    bullets: ['Открыты основные модули', 'Стартует после онбординга', 'После окончания включается read-only'],
                },
                {
                    title: 'Месячный тариф',
                    badge: 'Monthly',
                    description: 'Подходит для активно работающей частной практики.',
                    bullets: ['Поток пациентов и записей', 'Контроль платежей', 'Управление staff-лимитом'],
                },
                {
                    title: 'Годовой тариф',
                    badge: 'Yearly',
                    description: 'Удобный формат для стабильных клиник с долгим горизонтом работы.',
                    bullets: ['Долгосрочное использование', 'Простое продление подписки', 'Управляется супер-админом'],
                },
            ],
        },
        form: {
            badge: 'Стартуем через Telegram',
            title: 'Оставьте запрос на доступ',
            description:
                'Заполните форму, и откроется готовое сообщение для Telegram. Email не обязателен.',
            helper: 'После отправки запроса быстро связываемся через Telegram и запускаем онбординг.',
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
            eyebrow: 'Частые вопросы',
            title: 'Лендинг должен снимать основные вопросы до разговора',
            items: [
                {
                    question: 'Можно зарегистрироваться самостоятельно?',
                    answer: 'Нет. В Identa нет публичной регистрации. Доступ выдает супер-админ.',
                },
                {
                    question: 'Как посмотреть демо?',
                    answer: 'Оставляете запрос через форму, и мы связываемся в Telegram для демо и онбординга.',
                },
                {
                    question: 'Система работает на телефоне?',
                    answer: 'Да. И лендинг, и сам продукт адаптированы для мобильных устройств, планшетов и десктопа.',
                },
                {
                    question: 'Что будет после окончания подписки?',
                    answer: 'Аккаунт не исчезает сразу. Данные остаются доступны в режиме read-only до продления.',
                },
            ],
        },
        finalCta: {
            title: 'Готовы аккуратно оцифровать практику?',
            description: 'Напишите в Telegram или перейдите ко входу, если доступ уже выдан.',
            primary: 'Отправить запрос',
            secondary: 'Войти',
        },
        footer: '(c) 2026 Identa. Создано для частных стоматологов Узбекистана.',
    },
    en: {
        nav: {
            product: 'Product',
            workflow: 'How it works',
            plans: 'Plans',
            faq: 'FAQ',
            signIn: 'Sign In',
        },
        hero: {
            badge: 'Built for solo dentists and small clinics',
            title: 'Run appointments, patients, and',
            accent: 'outstanding balances in one system',
            description:
                'Identa is designed for private dental practice: patient records, odontogram, treatment history, payments, and staff access come together in one clean workflow.',
            primary: 'Request access',
            secondary: 'Sign in',
            helper: 'There is no public self-signup. Access is provisioned through onboarding and a super admin.',
            stats: [
                { value: '30 days', label: 'free trial' },
                { value: '3 languages', label: 'RU / UZ / EN' },
                { value: 'Read-only', label: 'data remains visible after expiry' },
            ],
        },
        preview: {
            title: 'One screen for the daily flow',
            cards: [
                { label: 'Today appointments', value: '8', tone: 'bg-blue-600' },
                { label: 'Pending revenue', value: '4.8M UZS', tone: 'bg-emerald-600' },
                { label: 'Active patients', value: '126', tone: 'bg-slate-900' },
            ],
            queueTitle: 'Today queue',
            queue: [
                { time: '09:00', patient: 'Dilshod Karimov', status: 'Checkup' },
                { time: '10:30', patient: 'Madina Rustamova', status: 'Whitening' },
                { time: '12:00', patient: 'Sardor Ergashev', status: 'Implant consultation' },
            ],
            summary: 'Patient details, odontogram, and payment status stay visible on a single page.',
        },
        outcomes: {
            eyebrow: 'What it solves',
            title: 'A compact landing should still answer the important questions',
            items: [
                {
                    title: 'Patients stay organized',
                    description: 'Records, treatment history, and images live in one structured place.',
                },
                {
                    title: 'Scheduling becomes manageable',
                    description: 'Daily and weekly calendars are faster to fill and easier to review.',
                },
                {
                    title: 'Debts and payments are visible',
                    description: 'You can instantly see what has been paid and what is still outstanding.',
                },
                {
                    title: 'Staff access stays controlled',
                    description: 'Assistants get only the permissions they actually need.',
                },
                {
                    title: 'Expiry does not erase your work',
                    description: 'After subscription expiry, the account can remain available in read-only mode.',
                },
                {
                    title: 'Works on every device',
                    description: 'Optimized for phones, tablets, laptops, and wide desktop screens.',
                },
            ],
        },
        workflow: {
            eyebrow: 'Getting started',
            title: 'Controlled onboarding instead of self-signup',
            description:
                'Identa does not use open registration. That keeps access clean, supports trial provisioning, and makes clinic onboarding more reliable.',
            steps: [
                {
                    title: '1. Submit a request',
                    description: 'Share your name, phone number, and clinic details. We continue the conversation in Telegram.',
                },
                {
                    title: '2. Demo and onboarding',
                    description: 'We walk through the product, answer pricing questions, and align on the trial.',
                },
                {
                    title: '3. Access is provisioned',
                    description: 'The super admin creates the account and can immediately attach trial and staff access.',
                },
            ],
        },
        plans: {
            eyebrow: 'Access model',
            title: 'Provisioned access, not open registration',
            description:
                'Accounts are created manually so trial, monthly, and yearly access can be managed in a controlled way.',
            items: [
                {
                    title: 'Free trial',
                    badge: '30 days',
                    description: 'A practical trial period to evaluate the product in your real clinic workflow.',
                    bullets: ['Core modules enabled', 'Starts with onboarding', 'Read-only can apply after expiry'],
                },
                {
                    title: 'Monthly plan',
                    badge: 'Monthly',
                    description: 'Fits active private practices that prefer flexible billing.',
                    bullets: ['Patient and schedule flow', 'Payment visibility', 'Managed staff limits'],
                },
                {
                    title: 'Yearly plan',
                    badge: 'Yearly',
                    description: 'A steady long-term option for clinics that want predictable access management.',
                    bullets: ['Longer operating horizon', 'Easy renewal flow', 'Controlled by super admin'],
                },
            ],
        },
        form: {
            badge: 'Start with Telegram',
            title: 'Request access',
            description:
                'Complete the form and we will open a ready-made Telegram message. Email is not required.',
            helper: 'After the request is sent, we continue the conversation in Telegram and guide you through onboarding.',
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
            title: 'The landing should reduce friction before the first conversation',
            items: [
                {
                    question: 'Can I register on my own?',
                    answer: 'No. Identa does not have public self-signup. Access is provisioned by a super admin.',
                },
                {
                    question: 'How do I see a demo?',
                    answer: 'Submit the request form and we will continue in Telegram for a short demo and onboarding.',
                },
                {
                    question: 'Does it work on mobile devices?',
                    answer: 'Yes. Both the landing page and the product experience are designed for mobile, tablet, and desktop use.',
                },
                {
                    question: 'What happens when subscription ends?',
                    answer: 'The account does not disappear immediately. Data can remain visible in read-only mode until renewal.',
                },
            ],
        },
        finalCta: {
            title: 'Ready to digitize your practice without chaos?',
            description: 'Use Telegram to start the conversation or sign in if your account already exists.',
            primary: 'Send request',
            secondary: 'Sign in',
        },
        footer: '(c) 2026 Identa. Built for private dental practices in Uzbekistan.',
    },
};

const OUTCOME_ICONS = [Stethoscope, CalendarDays, CreditCard, ShieldCheck, Lock, Globe] as const;

function buildTelegramHref(message: string): string {
    if (TELEGRAM_CONTACT_URL) {
        try {
            const directUrl = new URL(TELEGRAM_CONTACT_URL);
            directUrl.searchParams.set('text', message);
            return directUrl.toString();
        }
        catch {
            // Fallback below if env is not a valid URL.
        }
    }

    const shareUrl = new URL('https://t.me/share/url');
    shareUrl.searchParams.set('url', SITE_URL);
    shareUrl.searchParams.set('text', message);
    return shareUrl.toString();
}

function buildTelegramMessage(copy: (typeof LANDING_CONTENT)[LandingLocale], form: LandingFormState): string {
    const lines = [
        `Identa access request`,
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

export default function LandingPage() {
    const { locale } = useI18n();
    const content = LANDING_CONTENT[locale];
    const [form, setForm] = useState<LandingFormState>({
        name: '',
        phone: '',
        clinicName: '',
        city: '',
        note: '',
    });
    const [isSubmitted, setIsSubmitted] = useState(false);

    const errors = useMemo(() => ({
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
    }), [content.form.city, content.form.clinic, content.form.name, content.form.note, form]);

    const hasErrors = Boolean(
        errors.name
        || errors.phone
        || errors.clinicName
        || errors.city
        || errors.note
    );

    const handleTelegramSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasErrors) {
            toast.error(content.form.fixErrors);
            return;
        }

        const message = buildTelegramMessage(content, form);
        const telegramHref = buildTelegramHref(message);

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(message).then(
                () => toast.success(content.form.copied),
                () => undefined
            );
        }

        if (typeof window !== 'undefined') {
            window.open(telegramHref, '_blank', 'noopener,noreferrer');
        }

        toast.success(content.form.openedTelegram);
    };

    return (
        <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_38%),linear-gradient(180deg,#f7fbff_0%,#ffffff_42%,#f5f8ff_100%)] text-slate-950">
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
                    <div className="hidden items-center gap-6 lg:flex">
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
                    </div>
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
                    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12 lg:px-8 lg:py-20">
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
                                    {content.form.badge}
                                </div>
                                <h2 className="mt-5 text-3xl font-semibold tracking-tight">{content.form.title}</h2>
                                <p className="mt-4 text-sm leading-6 text-slate-300">{content.form.description}</p>
                                <p className="mt-4 text-sm leading-6 text-slate-400">{content.form.helper}</p>
                                <div className="mt-8 grid gap-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-sm font-medium text-white">{content.workflow.steps[0].title}</p>
                                        <p className="mt-1 text-sm text-slate-300">{content.workflow.steps[0].description}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-sm font-medium text-white">{content.workflow.steps[1].title}</p>
                                        <p className="mt-1 text-sm text-slate-300">{content.workflow.steps[1].description}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[28px] border-slate-200 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.4)]">
                            <CardContent className="p-6 sm:p-8">
                                <form className="space-y-5" onSubmit={handleTelegramSubmit}>
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
                                            {isSubmitted && errors.name ? (
                                                <p className="text-xs text-red-600">{errors.name}</p>
                                            ) : null}
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
                                            {isSubmitted && errors.phone ? (
                                                <p className="text-xs text-red-600">{errors.phone}</p>
                                            ) : null}
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
                                            {isSubmitted && errors.city ? (
                                                <p className="text-xs text-red-600">{errors.city}</p>
                                            ) : null}
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
                                            className="min-h-28"
                                        />
                                        {isSubmitted && errors.note ? (
                                            <p className="text-xs text-red-600">{errors.note}</p>
                                        ) : null}
                                    </div>

                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <Button type="submit" size="lg" className="h-12 flex-1 rounded-xl text-base">
                                            {content.form.submit}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <Button asChild type="button" size="lg" variant="outline" className="h-12 rounded-xl px-5">
                                            <a href={buildTelegramHref(content.form.title)} target="_blank" rel="noreferrer">
                                                {content.form.directTelegram}
                                            </a>
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="product" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                    <div className="space-y-4 text-center">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                            {content.outcomes.eyebrow}
                        </p>
                        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                            {content.outcomes.title}
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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

                <section id="plans" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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
                        {content.plans.items.map((plan) => (
                            <Card key={plan.title} className="rounded-[28px] border-slate-200 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.4)]">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-xl font-semibold text-slate-950">{plan.title}</h3>
                                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                                            {plan.badge}
                                        </span>
                                    </div>
                                    <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
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
                        ))}
                    </div>
                </section>

                <section id="faq" className="bg-slate-950 text-white">
                    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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
                                <Card key={item.question} className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none">
                                    <CardContent className="p-6">
                                        <p className="text-lg font-semibold">{item.question}</p>
                                        <p className="mt-3 text-sm leading-6 text-slate-300">{item.answer}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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
                                <Button asChild size="lg" className="h-12 rounded-xl bg-white px-6 text-base text-slate-950 hover:bg-slate-100">
                                    <a href="#access-request">
                                        {content.finalCta.primary}
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/20 bg-transparent px-6 text-base text-white hover:bg-white/10">
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
                        <a href="#access-request" className="transition hover:text-slate-900">
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
