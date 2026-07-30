const DEFAULT_SITE_URL = 'https://identa.uz';

export const SITE_NAME = 'Identa';
export const SOCIAL_IMAGE_PATH = '/opengraph-image';
export const SOCIAL_IMAGE_SIZE = {
    width: 1200,
    height: 630,
} as const;
export const SOCIAL_IMAGE_ALT =
    'Identa — стоматологическая CRM для клиник и частных стоматологов';

export function normalizeSiteUrl(value: string | undefined): string {
    if (!value) {
        return DEFAULT_SITE_URL;
    }

    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return DEFAULT_SITE_URL;
        }

        return url.origin;
    } catch {
        return DEFAULT_SITE_URL;
    }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL);

export function absoluteSiteUrl(path = '/'): string {
    return new URL(path, `${SITE_URL}/`).toString();
}

/**
 * JSON-LD is rendered inside a script element. Escaping `<` prevents a future
 * CMS-provided string containing `</script>` from terminating that element.
 */
export function serializeJsonLd(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}
