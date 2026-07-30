import type { Metadata } from 'next';
import { DEFAULT_LANDING_LOCALE, LANDING_CONTENT } from '@/lib/landing/content';
import {
    SOCIAL_IMAGE_ALT,
    SOCIAL_IMAGE_PATH,
    SOCIAL_IMAGE_SIZE,
    SITE_NAME,
    SITE_URL,
    absoluteSiteUrl,
} from '@/lib/seo/site';

export const LANDING_SEO_TITLE = 'Identa — стоматологическая CRM для клиник';
export const LANDING_SEO_DESCRIPTION =
    'Управляйте пациентами, приёмами, оплатами, сотрудниками и клиническими снимками в Identa. CRM для стоматологов с бесплатным доступом на 30 дней.';

export const LANDING_METADATA: Metadata = {
    // `absolute` prevents the root "%s | Identa" template from duplicating the
    // brand in the landing title.
    title: {
        absolute: LANDING_SEO_TITLE,
    },
    description: LANDING_SEO_DESCRIPTION,
    keywords: [
        'стоматологическая CRM',
        'CRM для стоматологии',
        'программа для стоматолога',
        'учёт пациентов стоматология',
        'одонтограмма онлайн',
        SITE_NAME,
    ],
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: LANDING_SEO_TITLE,
        description: LANDING_SEO_DESCRIPTION,
        url: '/',
        siteName: SITE_NAME,
        type: 'website',
        locale: 'ru_UZ',
        alternateLocale: ['uz_UZ', 'en_US'],
        images: [
            {
                url: SOCIAL_IMAGE_PATH,
                ...SOCIAL_IMAGE_SIZE,
                alt: SOCIAL_IMAGE_ALT,
                type: 'image/png',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: LANDING_SEO_TITLE,
        description: LANDING_SEO_DESCRIPTION,
        images: [
            {
                url: SOCIAL_IMAGE_PATH,
                alt: SOCIAL_IMAGE_ALT,
            },
        ],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
        },
    },
};

export const ORGANIZATION_STRUCTURED_DATA = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
        '@type': 'ImageObject',
        url: absoluteSiteUrl('/brand/identa-full-logo.png'),
        width: 580,
        height: 680,
    },
};

export const WEBSITE_STRUCTURED_DATA = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ['ru', 'uz', 'en'],
    publisher: {
        '@id': `${SITE_URL}/#organization`,
    },
};

export const SOFTWARE_APPLICATION_STRUCTURED_DATA = {
    '@context': 'https://schema.org',
    '@type': ['SoftwareApplication', 'WebApplication'],
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android',
    url: SITE_URL,
    description: LANDING_SEO_DESCRIPTION,
    offers: {
        '@type': 'Offer',
        price: 0,
        priceCurrency: 'UZS',
        description: '30 дней бесплатного пробного доступа после регистрации.',
        url: absoluteSiteUrl('/register'),
    },
    audience: {
        '@type': 'Audience',
        audienceType: 'Стоматологи, частные клиники и небольшие стоматологические команды',
    },
    featureList: [
        'Управление пациентами',
        'Расписание приёмов',
        'Учёт оплат',
        'Клинические снимки',
        'Права доступа сотрудников',
        'Синхронизация web-кабинета и мобильного приложения',
    ],
    publisher: {
        '@id': `${SITE_URL}/#organization`,
    },
};

export const FAQ_STRUCTURED_DATA = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: DEFAULT_LANDING_LOCALE,
    mainEntity: LANDING_CONTENT[DEFAULT_LANDING_LOCALE].faq.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
        },
    })),
};

export const LANDING_STRUCTURED_DATA = [
    ORGANIZATION_STRUCTURED_DATA,
    WEBSITE_STRUCTURED_DATA,
    SOFTWARE_APPLICATION_STRUCTURED_DATA,
    FAQ_STRUCTURED_DATA,
] as const;
