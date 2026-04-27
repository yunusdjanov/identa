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
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        }
    );
}
