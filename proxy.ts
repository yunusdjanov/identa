import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'identa.uz';
const WWW_HOST = 'www.identa.uz';

export function proxy(request: NextRequest) {
    const host = request.headers.get('host');

    if (host === WWW_HOST) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.protocol = 'https';
        redirectUrl.host = CANONICAL_HOST;

        return NextResponse.redirect(redirectUrl, 308);
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/:path*',
};
