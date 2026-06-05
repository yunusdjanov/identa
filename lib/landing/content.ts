// Landing-page content (RU primary, UZ, EN). Ported from the former
// standalone handoff bundle into a typed module so the marketing page can be
// server-rendered natively by Next (crawlable, no iframe, no CDN React).

export const LANDING_LOCALES = ['ru', 'uz', 'en'] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];
export const DEFAULT_LANDING_LOCALE: LandingLocale = 'ru';

export interface LandingDictionary {
    nav: { features: string; pricing: string; howto: string; faq: string; login: string; cta: string; mobile: string };
    hero: {
        eyebrow: string;
        status: string;
        title: [string, string, string, string];
        lede: string;
        ctaPrimary: string;
        ctaSecondary: string;
        stats: { v: string; l: string }[];
        dash: {
            title: string;
            date: string;
            kpis: { l: string; v: string; d: string }[];
            appts: { txt: string; c: string }[];
            days: string[];
            nav: string[];
            float1: { name: string; meta: string };
            float2: { name: string; meta: string };
        };
    };
    stats: { eyebrow: string; items: { n: string; l: string }[] };
    why: {
        eyebrow: string;
        title: [string, string, string];
        lede: string;
        cards: { n: string; t: [string, string]; d: string; viz: 'schedule' | 'chart' | 'list' }[];
    };
    mobile: {
        eyebrow: string;
        title: [string, string, string];
        lede: string;
        points: { t: string; d: string }[];
        badges: string[];
        mockupLabel: string;
        today: string;
        appointments: string;
        timeline: { time: string; name: string; meta: string; kind: string }[];
        tabs: string[];
        floatA: { t: string; d: string };
        floatB: { t: string; d: string };
    };
    pricing: {
        eyebrow: string;
        title: [string, string];
        lede: string;
        monthly: string;
        yearly: string;
        save: string;
        // Localized phrasing for plan facts pulled from the DB at render time
        // (see lib/landing/plans.ts). `{n}` / `{noun}` / `{mb}` / `{days}` are
        // interpolated; staffForms/imageForms carry the plural forms
        // (ru: [one, few, many]; en: [one, other]; uz: invariant single form).
        feature: {
            staff: string;
            staffForms: string[];
            images: string;
            imageForms: string[];
            upload: string;
            exportOn: string;
            exportOff: string;
            payx: string;
            trialPrice: string;
            priceInApp: string;
            currencySuffix: string;
            perMonth: string;
            perYear: string;
        };
        plans: {
            code: 'trial' | 'basic' | 'pro';
            name: string;
            desc: string;
            cta: string;
            flag?: string;
            featured?: boolean;
        }[];
    };
    steps: { eyebrow: string; title: [string, string, string]; lede: string; items: { n: string; t: string; d: string }[] };
    faq: { eyebrow: string; title: [string, string, string]; lede: string; items: { q: string; a: string }[] };
    cta: { title: [string, string, string]; lede: string; primary: string; secondary: string };
    footer: { tag: string; copy: string };
}

export const LANDING_CONTENT: Record<LandingLocale, LandingDictionary> = {
    ru: {
        nav: { features: 'Возможности', mobile: 'Мобильное', pricing: 'Тарифы', howto: 'Как начать', faq: 'Вопросы', login: 'Войти', cta: 'Попробовать' },
        hero: {
            eyebrow: 'Пациенты · Приёмы · Оплаты · Снимки',
            status: '30 дней бесплатно',
            title: ['Стоматология, ', 'собранная', ' в ', 'одной системе.'],
            lede: '',
            ctaPrimary: 'Начать бесплатно',
            ctaSecondary: 'Войти',
            stats: [
                { v: '30 дн.', l: 'Пробный доступ после регистрации' },
                { v: '3 модуля', l: 'Пациенты, приёмы и оплаты' },
                { v: '6 прав доступа', l: 'Для сотрудников' },
            ],
            dash: {
                title: 'Сегодня',
                date: 'ВТ · 5 МАЯ',
                kpis: [
                    { l: 'Записей', v: '18', d: '+4 к чт' },
                    { l: 'Доход', v: '8.4M', d: 'сум' },
                    { l: 'Загрузка', v: '92%', d: '3 кресла' },
                ],
                appts: [
                    { txt: 'Карина А.', c: 'navy' },
                    { txt: 'Имплант', c: 'teal' },
                    { txt: 'Осмотр', c: 'soft' },
                    { txt: 'Чистка', c: 'navy' },
                    { txt: 'Брекеты', c: 'teal' },
                ],
                days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'],
                nav: ['Обзор', 'Приёмы', 'Пациенты', 'Оплаты', 'Тарифы', 'Команда'],
                float1: { name: 'Алишер К.', meta: 'Подтвердил визит · 14:30' },
                float2: { name: 'Платёж получен', meta: '1 200 000 сум · PayX' },
            },
        },
        stats: {
            eyebrow: 'В цифрах',
            items: [
                { n: '30 дней', l: 'пробного доступа после регистрации' },
                { n: '3 тарифа', l: 'пробный, базовый и расширенный' },
                { n: '10 снимков', l: 'на запись в расширенном тарифе' },
                { n: '6 прав доступа', l: 'для сотрудников: пациенты, приёмы и оплаты' },
            ],
        },
        why: {
            eyebrow: 'Почему Identa',
            title: ['Всё для ', 'приёма пациента,', ' без лишней сложности.'],
            lede: 'Каждая функция начиналась с разговора с врачом. Никаких лишних кнопок, длинных меню и обязательных полей, которые мешают принимать пациента.',
            cards: [
                { n: '01', t: ['Расписание ', 'без перекрытий'], d: 'Приёмы создаются и обновляются в календаре, а система помогает избегать пересечений и путаницы со статусами. Сотрудник может только смотреть или управлять — в зависимости от выданных прав.', viz: 'schedule' },
                { n: '02', t: ['Финансы ', 'и аналитика'], d: 'Оплаты, счета и история платежей связаны с пациентами и приёмами. Доступ к платежам можно дать отдельно от пациентов и записей.', viz: 'chart' },
                { n: '03', t: ['Карты пациентов ', 'в одном месте'], d: 'Профиль пациента, история лечения, заметки, зубная карта и снимки хранятся в кабинете и показываются только тем, у кого есть доступ.', viz: 'list' },
            ],
        },
        mobile: {
            eyebrow: 'Мобильное приложение',
            title: ['Рабочий кабинет ', 'в телефоне', '.'],
            lede: 'Мобильное приложение Identa работает с тем же аккаунтом и данными, что и веб-кабинет: врач и команда смогут быстро просматривать расписание, карточки пациентов, платежи и важные обновления прямо с телефона.',
            points: [
                { t: 'Расписание на смене', d: 'Проверяйте сегодняшние приёмы, статус визита и ближайшие записи без ноутбука.' },
                { t: 'Пациент под рукой', d: 'Открывайте профиль, контакты, историю лечения, снимки и заметки перед приёмом.' },
                { t: 'Оплаты и уведомления', d: 'Просматривайте статусы платежей и получайте важные события по клинике в мобильном интерфейсе.' },
            ],
            badges: ['Android • iOS скоро', 'Единый аккаунт', 'Синхронизация с веб-кабинетом'],
            mockupLabel: 'Мобильное приложение Identa',
            today: 'Сегодня',
            appointments: 'приёмов',
            timeline: [
                { time: '09:30', name: 'Карина А.', meta: 'Осмотр · подтверждено', kind: 'navy' },
                { time: '11:00', name: 'Имплант', meta: 'Подготовить снимки', kind: 'teal' },
                { time: '14:30', name: 'Алишер К.', meta: 'Оплата получена', kind: 'soft' },
            ],
            tabs: ['Обзор', 'Пациент', 'Оплаты'],
            floatA: { t: 'Push-уведомления', d: 'визиты, оплаты и задачи' },
            floatB: { t: 'Web + mobile', d: 'данные синхронизируются' },
        },
        pricing: {
            eyebrow: 'Тарифы',
            title: ['Прозрачные цены, ', 'без сюрпризов.'],
            lede: 'Пробный доступ включается автоматически. Базовый и расширенный тарифы подключаются через PayX; после окончания срока кабинет остаётся доступным для просмотра без удаления данных.',
            monthly: 'Ежемесячно',
            yearly: 'Год',
            save: '',
            feature: {
                staff: 'Доктор + {n} {noun}',
                staffForms: ['сотрудник', 'сотрудника', 'сотрудников'],
                images: '{n} {noun} на запись',
                imageForms: ['снимок', 'снимка', 'снимков'],
                upload: 'Загрузка до {mb} МБ',
                exportOn: 'Выгрузка доступна',
                exportOff: 'Выгрузка недоступна',
                payx: 'Оплата на месяц или год через PayX',
                trialPrice: '{days} дней',
                priceInApp: 'Цена в кабинете',
                currencySuffix: 'сум',
                perMonth: '/мес',
                perYear: '/год',
            },
            plans: [
                { code: 'trial', name: 'Пробный', desc: 'Автоматический пробный доступ сразу после регистрации.', cta: 'Начать пробный доступ', flag: 'Автоматически' },
                { code: 'basic', name: 'Базовый', desc: 'Для небольшой команды с базовыми лимитами.', cta: 'Выбрать базовый', flag: 'Основной', featured: true },
                { code: 'pro', name: 'Расширенный', desc: 'Для клиник, которым нужны повышенные лимиты и выгрузка данных.', cta: 'Выбрать расширенный' },
            ],
        },
        steps: {
            eyebrow: 'Как начать',
            title: ['От регистрации до ', 'рабочего кабинета ', '— без ожидания.'],
            lede: 'Создайте учётную запись по электронной почте и паролю или через Google. Пробный доступ создаётся автоматически, а данные остаются доступными даже после окончания тарифа в режиме просмотра.',
            items: [
                { n: '1', t: 'Зарегистрируйтесь', d: 'Электронная почта и пароль или Google. Кабинет доктора сразу получает активный пробный доступ на 30 дней.' },
                { n: '2', t: 'Заполните кабинет', d: 'Добавьте пациентов, приёмы, оплаты, сотрудников и права доступа для команды.' },
                { n: '3', t: 'Работайте по ролям', d: 'Сотрудник видит только разрешённые разделы: пациенты, приёмы и оплаты с правами просмотра или управления.' },
                { n: '4', t: 'Продлите тариф', d: 'Базовый или расширенный тариф подключается через PayX. Если срок закончился, данные остаются доступны для просмотра.' },
            ],
        },
        faq: {
            eyebrow: 'Частые вопросы',
            title: ['Всё, что хотят ', 'узнать врачи ', 'перед стартом.'],
            lede: 'Собрали главное, что важно понять перед регистрацией и первым рабочим днём в системе.',
            items: [
                { q: 'Что происходит после регистрации?', a: 'Создаётся кабинет доктора и автоматически включается пробный доступ на 30 дней. После входа можно добавить пациентов, приёмы, оплаты, снимки и сотрудников.' },
                { q: 'Можно ли войти через Google?', a: 'Да. Если электронная почта уже есть в системе, пользователь войдёт в существующий кабинет; если нет — будет создан новый кабинет доктора с пробным доступом.' },
                { q: 'Что будет, если тариф закончится?', a: 'Учётная запись не удаляется. Данные остаются доступными для просмотра, но создание, изменение, удаление, загрузка снимков и выгрузка блокируются до продления тарифа.' },
                { q: 'Как работают сотрудники и права доступа?', a: 'Доктор добавляет сотрудников и выдаёт права отдельно для пациентов, приёмов и оплат: просмотр или управление. Закрытый раздел нельзя открыть ни из меню, ни по прямой ссылке.' },
                { q: 'Как защищаются клинические снимки?', a: 'Снимки проверяются, очищаются от лишних данных и хранятся закрыто. Доступ получает только доктор или сотрудник с нужным правом, а загрузка ограничивается текущим тарифом.' },
            ],
        },
        cta: {
            title: ['Готовы привести ', 'клинику ', 'в порядок?'],
            lede: 'Создайте учётную запись самостоятельно и получите 30 дней пробного доступа. Когда будете готовы, базовый или расширенный тариф можно подключить в разделе оплаты.',
            primary: 'Начать бесплатно',
            secondary: 'Войти в кабинет',
        },
        footer: { tag: 'Стоматология, собранная воедино.', copy: '© 2026 Identa · Ташкент, Узбекистан' },
    },

    uz: {
        nav: { features: 'Imkoniyatlar', mobile: 'Mobil ilova', pricing: 'Tariflar', howto: 'Boshlash', faq: 'Savollar', login: 'Kirish', cta: "Sinab koʻrish" },
        hero: {
            eyebrow: "Bemorlar · Qabullar · Toʻlovlar · Rasmlar",
            status: '30 kun bepul',
            title: ['Stomatologiya ', 'tartibda,', ' hammasi ', 'bir tizimda.'],
            lede: '',
            ctaPrimary: 'Bepul boshlash',
            ctaSecondary: 'Kirish',
            stats: [
                { v: '30 kun', l: "Roʻyxatdan keyin sinov muddati" },
                { v: '3 modul', l: "Bemorlar, qabullar va toʻlovlar" },
                { v: '6 ruxsat', l: 'Xodimlar uchun kirish huquqlari' },
            ],
            dash: {
                title: 'Bugun',
                date: 'SE · 5 MAY',
                kpis: [
                    { l: 'Qabullar', v: '18', d: '+4 paysh.' },
                    { l: 'Daromad', v: '8.4M', d: "soʻm" },
                    { l: 'Bandlik', v: '92%', d: '3 kreslo' },
                ],
                appts: [
                    { txt: 'Karina A.', c: 'navy' },
                    { txt: 'Implant', c: 'teal' },
                    { txt: "Koʻrik", c: 'soft' },
                    { txt: 'Tozalash', c: 'navy' },
                    { txt: 'Breket', c: 'teal' },
                ],
                days: ['Du', 'Se', 'Chor', 'Pa', 'Ju'],
                nav: ['Boshqaruv', 'Qabullar', 'Bemorlar', "Toʻlovlar", 'Tariflar', 'Jamoa'],
                float1: { name: 'Alisher K.', meta: 'Tashrifni tasdiqladi · 14:30' },
                float2: { name: "Toʻlov olindi", meta: "1 200 000 soʻm · PayX" },
            },
        },
        stats: {
            eyebrow: 'Raqamlarda',
            items: [
                { n: '30 kun', l: "sinov muddati roʻyxatdan oʻtgach ochiladi" },
                { n: '3 tarif', l: 'sinov, asosiy va pro' },
                { n: '10 rasm', l: 'kengaytirilgan tarifda har yozuv uchun' },
                { n: '6 ruxsat', l: "xodimlar uchun: bemorlar, qabullar va toʻlovlar" },
            ],
        },
        why: {
            eyebrow: 'Nega Identa',
            title: ['Bemor qabuliga ', "kerak boʻlgan hammasi,", ' ortiqcha murakkabliksiz.'],
            lede: "Har bir funksiya shifokor bilan suhbatdan boshlangan. Ortiqcha tugma, uzun menyu va bemor qabuliga xalaqit beradigan majburiy maydonlar yoʻq.",
            cards: [
                { n: '01', t: ['Qabullar ', 'nazoratda'], d: "Qabullar kalendarda yaratiladi va yangilanadi, tizim esa vaqt toʻqnashuvi va holatlar boʻyicha tartibni saqlashga yordam beradi. Xodim faqat berilgan koʻrish yoki boshqarish huquqi boʻyicha ishlaydi.", viz: 'schedule' },
                { n: '02', t: ["Toʻlovlar ", 'nazoratda'], d: "Toʻlovlar, hisoblar va toʻlov tarixi bemorlar hamda qabullar bilan bogʻlanadi. Toʻlov boʻlimi huquqlarini boshqa boʻlimlardan alohida boshqarish mumkin.", viz: 'chart' },
                { n: '03', t: ['Bemor profili ', 'bir joyda'], d: "Bemor profili, davolanish tarixi, izohlar, tish xaritasi va rasmlar kabinetda saqlanadi va faqat ruxsati bor foydalanuvchilarga koʻrinadi.", viz: 'list' },
            ],
        },
        mobile: {
            eyebrow: 'Mobil ilova',
            title: ['Ish kabineti ', 'telefoningizda', '.'],
            lede: "Identa mobil ilovasi web-kabinet bilan bir xil akkaunt va maʼlumotlar asosida ishlaydi: shifokor va jamoa jadval, bemor kartasi, toʻlovlar va muhim yangilanishlarni telefondan tez koʻra oladi.",
            points: [
                { t: 'Smena jadvali', d: 'Bugungi qabullar, tashrif holati va yaqin yozuvlarni noutbuksiz tekshiring.' },
                { t: 'Bemor kartasi yoningizda', d: 'Qabuldan oldin profil, kontaktlar, davolanish tarixi, rasmlar va izohlarni oching.' },
                { t: "Toʻlovlar va xabarlar", d: "Toʻlovlar holatini kuzating va klinikadagi muhim voqealarni mobil interfeysda oling." },
            ],
            badges: ['Android • iOS tez orada', 'Bitta akkaunt', 'Web-kabinet bilan sinxron'],
            mockupLabel: 'Identa mobil ilovasi',
            today: 'Bugun',
            appointments: 'qabul',
            timeline: [
                { time: '09:30', name: 'Karina A.', meta: "Koʻrik · tasdiqlandi", kind: 'navy' },
                { time: '11:00', name: 'Implant', meta: 'Rasmlarni tayyorlash', kind: 'teal' },
                { time: '14:30', name: 'Alisher K.', meta: "Toʻlov olindi", kind: 'soft' },
            ],
            tabs: ['Boshqaruv', 'Bemor', "Toʻlov"],
            floatA: { t: 'Push xabarlar', d: "qabul, toʻlov va vazifalar" },
            floatB: { t: 'Web + mobile', d: "maʼlumotlar sinxron" },
        },
        pricing: {
            eyebrow: 'Tariflar',
            title: ['Shaffof narxlar, ', "yashirin toʻlovlarsiz."],
            lede: "Sinov muddati avtomatik ochiladi. Asosiy va kengaytirilgan tariflar PayX orqali ulanadi; muddat tugasa kabinetdagi maʼlumotlar oʻchmaydi va faqat koʻrish rejimida qoladi.",
            monthly: 'Oylik',
            yearly: 'Yillik',
            save: '',
            feature: {
                staff: 'Shifokor + {n} xodim',
                staffForms: ['xodim'],
                images: 'Har yozuv uchun {n} ta rasm',
                imageForms: ['rasm'],
                upload: 'Yuklash {mb} MB gacha',
                exportOn: 'Eksport bor',
                exportOff: 'Eksport yoʻq',
                payx: 'Oylik yoki yillik toʻlov PayX orqali',
                trialPrice: '{days} kun',
                priceInApp: 'Narx kabinet ichida',
                currencySuffix: "so'm",
                perMonth: '/oy',
                perYear: '/yil',
            },
            plans: [
                { code: 'trial', name: 'Sinov', desc: "Roʻyxatdan oʻtgach avtomatik ochiladigan sinov tarifi.", cta: 'Sinovni boshlash', flag: 'Avtomatik' },
                { code: 'basic', name: 'Asosiy', desc: 'Kichik jamoa uchun asosiy imkoniyatlar.', cta: 'Asosiy tarifni tanlash', flag: 'Asosiy', featured: true },
                { code: 'pro', name: 'Pro', desc: "Koʻproq rasm, koʻproq xodim va eksport kerak boʻlgan klinikalar uchun.", cta: 'Pro tarifni tanlash' },
            ],
        },
        steps: {
            eyebrow: 'Boshlash',
            title: ["Roʻyxatdan ", 'ish kabinetigacha ', '— kutishsiz.'],
            lede: "Elektron pochta va parol yoki Google orqali hisob oching. Sinov muddati avtomatik yaratiladi, maʼlumotlar esa tarif tugaganda ham faqat koʻrish rejimida saqlanadi.",
            items: [
                { n: '1', t: "Roʻyxatdan oʻting", d: "Elektron pochta va parol yoki Google. Shifokor kabineti darhol 30 kunlik faol sinov muddatini oladi." },
                { n: '2', t: "Kabinetni toʻldiring", d: "Bemorlar, qabullar, toʻlovlar, xodimlar va jamoa ruxsatlarini qoʻshing." },
                { n: '3', t: 'Rollar bilan ishlang', d: "Xodim faqat berilgan boʻlim ruxsati bilan ishlaydi: bemorlar, qabullar va toʻlovlar uchun koʻrish yoki boshqarish." },
                { n: '4', t: 'Tarifni yangilang', d: "Asosiy yoki kengaytirilgan tarif PayX orqali ulanadi. Muddat tugasa, maʼlumotlar koʻrish uchun ochiq qoladi." },
            ],
        },
        faq: {
            eyebrow: 'Tez-tez beriladigan savollar',
            title: ['Shifokorlar ', 'boshlashdan oldin ', "soʻraydigan savollar."],
            lede: "Roʻyxatdan oʻtish va birinchi ish kunidan oldin bilish kerak boʻlgan asosiy javoblar.",
            items: [
                { q: "Roʻyxatdan keyin nima boʻladi?", a: "Shifokor kabineti yaratiladi va 30 kunlik sinov muddati avtomatik yoqiladi. Kirgandan keyin bemorlar, qabullar, toʻlovlar, rasmlar va xodimlarni kiritish mumkin." },
                { q: 'Google orqali kirish mumkinmi?', a: "Ha. Elektron pochta tizimda mavjud boʻlsa shu hisobga kiradi, mavjud boʻlmasa yangi shifokor kabineti va sinov muddati yaratiladi." },
                { q: "Tarif muddati tugasa nima boʻladi?", a: "Hisob oʻchmaydi. Maʼlumotlar koʻrish uchun ochiq qoladi, lekin yaratish, tahrirlash, oʻchirish, rasm yuklash va eksport qilish tarif uzaytirilmaguncha bloklanadi." },
                { q: 'Xodimlar va ruxsatlar qanday ishlaydi?', a: "Shifokor xodim qoʻshadi va bemorlar, qabullar hamda toʻlovlar uchun alohida koʻrish yoki boshqarish huquqini beradi. Yopiq boʻlim menyudan ham, toʻgʻridan-toʻgʻri havoladan ham ochilmaydi." },
                { q: 'Klinik rasmlar qanday himoyalanadi?', a: "Rasmlar tekshiruvdan oʻtadi, ortiqcha maʼlumotlardan tozalanadi va yopiq saqlanadi. Ularni faqat shifokor yoki kerakli ruxsatga ega xodim koʻra oladi, yuklash esa tarif limiti bilan cheklanadi." },
            ],
        },
        cta: {
            title: ['Klinikangizni ', 'tartibga ', 'solishga tayyormisiz?'],
            lede: "Hisobni oʻzingiz oching va 30 kunlik sinov muddatini oling. Tayyor boʻlganda asosiy yoki kengaytirilgan tarifni toʻlov boʻlimi orqali ulang.",
            primary: 'Bepul boshlash',
            secondary: 'Kabinetga kirish',
        },
        footer: { tag: 'Stomatologiya bir tizimda.', copy: "© 2026 Identa · Toshkent, Oʻzbekiston" },
    },

    en: {
        nav: { features: 'Features', mobile: 'Mobile app', pricing: 'Pricing', howto: 'Get started', faq: 'FAQ', login: 'Sign in', cta: 'Try free' },
        hero: {
            eyebrow: 'Patients · Appointments · Payments · Images',
            status: '30 days free',
            title: ['Dentistry, ', 'organized', ' in ', 'one workspace.'],
            lede: '',
            ctaPrimary: 'Start free',
            ctaSecondary: 'Sign in',
            stats: [
                { v: '30 days', l: 'Trial after signup' },
                { v: '3 modules', l: 'Patients, appointments and payments' },
                { v: '6 permissions', l: 'Staff access controls' },
            ],
            dash: {
                title: 'Today',
                date: 'TUE · MAY 5',
                kpis: [
                    { l: 'Bookings', v: '18', d: '+4 vs Thu' },
                    { l: 'Revenue', v: '8.4M', d: 'UZS' },
                    { l: 'Capacity', v: '92%', d: '3 chairs' },
                ],
                appts: [
                    { txt: 'Karina A.', c: 'navy' },
                    { txt: 'Implant', c: 'teal' },
                    { txt: 'Checkup', c: 'soft' },
                    { txt: 'Cleaning', c: 'navy' },
                    { txt: 'Braces', c: 'teal' },
                ],
                days: ['Mo', 'Tu', 'We', 'Th', 'Fr'],
                nav: ['Dashboard', 'Appointments', 'Patients', 'Payments', 'Billing', 'Team'],
                float1: { name: 'Alisher K.', meta: 'Confirmed visit · 2:30 PM' },
                float2: { name: 'Payment received', meta: '1,200,000 UZS · PayX' },
            },
        },
        stats: {
            eyebrow: 'By the numbers',
            items: [
                { n: '30 days', l: 'of trial access after registration' },
                { n: '3 plans', l: 'Trial, Basic and Pro' },
                { n: '10 images', l: 'per entry on Pro' },
                { n: '6 permissions', l: 'for patients, appointments and payments' },
            ],
        },
        why: {
            eyebrow: 'Why Identa',
            title: ['Built for ', 'dentists,', ' not for accountants.'],
            lede: 'Every feature started as a conversation with a doctor. No extra buttons, no long menus, no required fields that get in the way of the patient in the chair.',
            cards: [
                { n: '01', t: ['Appointments ', 'under control'], d: 'Appointments are created and updated in the calendar, while the system helps prevent overlap and status confusion. Staff can view or manage only when permitted.', viz: 'schedule' },
                { n: '02', t: ['Payments ', 'and billing'], d: 'Payments, invoices and payment history connect to patients and appointments. Payment access can be managed separately from patient and appointment access.', viz: 'chart' },
                { n: '03', t: ['Patient profiles ', 'in one place'], d: 'Patient profiles, treatment history, notes, odontogram and images stay in the clinic workspace and are visible only to users with access.', viz: 'list' },
            ],
        },
        mobile: {
            eyebrow: 'Mobile app',
            title: ['The clinic workspace ', 'on your phone', '.'],
            lede: 'The Identa mobile app uses the same account and data as the web workspace, so doctors and staff can quickly review schedules, patient cards, payments and important clinic updates from a phone.',
            points: [
                { t: 'Schedule during the shift', d: "Check today's appointments, visit status and upcoming bookings without opening a laptop." },
                { t: 'Patient card in hand', d: 'Open profile details, contacts, treatment history, images and notes before the visit.' },
                { t: 'Payments and alerts', d: 'See payment status and receive important clinic events in a focused mobile interface.' },
            ],
            badges: ['Android • iOS soon', 'One account', 'Synced with web'],
            mockupLabel: 'Identa mobile app',
            today: 'Today',
            appointments: 'appointments',
            timeline: [
                { time: '09:30', name: 'Karina A.', meta: 'Checkup · confirmed', kind: 'navy' },
                { time: '11:00', name: 'Implant', meta: 'Prepare images', kind: 'teal' },
                { time: '14:30', name: 'Alisher K.', meta: 'Payment received', kind: 'soft' },
            ],
            tabs: ['Home', 'Patient', 'Pay'],
            floatA: { t: 'Push alerts', d: 'visits, payments and tasks' },
            floatB: { t: 'Web + mobile', d: 'data stays synced' },
        },
        pricing: {
            eyebrow: 'Pricing',
            title: ['Honest pricing, ', 'no surprises.'],
            lede: 'Trial starts automatically. Basic and Pro are connected through PayX; when a plan expires, clinic data is not deleted and remains available in read-only mode.',
            monthly: 'Monthly',
            yearly: 'Yearly',
            save: '',
            feature: {
                staff: 'Doctor + {n} {noun}',
                staffForms: ['staff member', 'staff members'],
                images: '{n} {noun} per entry',
                imageForms: ['image', 'images'],
                upload: 'Upload up to {mb} MB',
                exportOn: 'Export enabled',
                exportOff: 'No export',
                payx: 'Monthly/yearly via PayX',
                trialPrice: '{days} days',
                priceInApp: 'Price in app',
                currencySuffix: 'UZS',
                perMonth: '/mo',
                perYear: '/yr',
            },
            plans: [
                { code: 'trial', name: 'Trial', desc: 'Automatic trial access right after registration.', cta: 'Start trial', flag: 'Automatic' },
                { code: 'basic', name: 'Basic', desc: 'Core capabilities for a small team.', cta: 'Choose Basic', flag: 'Core', featured: true },
                { code: 'pro', name: 'Pro', desc: 'More images, more staff members and export for active clinics.', cta: 'Choose Pro' },
            ],
        },
        steps: {
            eyebrow: 'How it works',
            title: ['From signup to ', 'workspace ', '— without waiting.'],
            lede: 'Create an account with email/password or Google. Trial is created automatically, and data stays visible in read-only mode if a plan expires.',
            items: [
                { n: '1', t: 'Register', d: "Use email/password or Google. The doctor's workspace immediately receives an active 30-day trial." },
                { n: '2', t: 'Fill the workspace', d: 'Add patients, appointments, payments, staff members and team permissions.' },
                { n: '3', t: 'Work by role', d: 'Staff can access only permitted modules: patients, appointments and payments with view/manage rules.' },
                { n: '4', t: 'Upgrade when ready', d: 'Basic or Pro is purchased through PayX. If a plan expires, existing data stays readable.' },
            ],
        },
        faq: {
            eyebrow: 'Frequently asked',
            title: ['What dentists ', 'want to know ', 'before they start.'],
            lede: 'The key answers to know before registration and the first working day in Identa.',
            items: [
                { q: 'What happens after registration?', a: "A doctor's workspace is created and a 30-day trial starts automatically. After sign-in, the clinic can add patients, appointments, payments, images and staff." },
                { q: 'Can users sign in with Google?', a: 'Yes. Existing emails log in to the existing workspace; new emails create a new doctor’s workspace with a trial.' },
                { q: 'What happens when a plan expires?', a: 'The account is not deleted. Data remains visible, while create, edit, delete, image upload and export actions stay blocked until the plan is renewed.' },
                { q: 'How do staff and permissions work?', a: 'The doctor adds staff and grants view or manage access separately for patients, appointments and payments. Locked sections cannot be opened from the menu or by direct URL.' },
                { q: 'How are clinical images protected?', a: 'Images are checked, sanitized and stored privately. Only the doctor or permitted staff can access them, and uploads follow the limits of the current plan.' },
            ],
        },
        cta: {
            title: ['Ready to put your ', 'clinic ', 'in order?'],
            lede: 'Create your account and get a 30-day trial. When ready, connect Basic or Pro from billing.',
            primary: 'Start free',
            secondary: 'Sign in',
        },
        footer: { tag: 'Dentistry, brought together.', copy: '© 2026 Identa · Tashkent, Uzbekistan' },
    },
};
