import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ message: 'Logged out.' });
    response.cookies.delete('mock_session');
    response.cookies.delete('mock_role');
    return response;
}
