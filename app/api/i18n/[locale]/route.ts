import { NextResponse } from 'next/server';
import { resolveLocale, type AppLocale } from '@/lib/i18n/config';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ locale: string }> }
) {
    const { locale } = await params;
    const resolvedLocale: AppLocale = resolveLocale(locale);

    return NextResponse.json(
        { locale: resolvedLocale, dictionary: DICTIONARIES[resolvedLocale] },
        {
            headers: {
                // Always revalidate so dictionary changes ship immediately.
                // (Original `immutable, max-age=31536000` made new translation
                // keys invisible until the browser cache aged out.)
                'Cache-Control': 'no-cache, must-revalidate',
            },
        }
    );
}
