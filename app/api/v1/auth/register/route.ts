import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ message: 'Registration not available in demo mode.' }, { status: 422 });
    return response;
}
