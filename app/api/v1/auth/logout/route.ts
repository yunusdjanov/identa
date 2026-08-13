import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ message: 'Logged out.' });
    response.cookies.delete('mock_session');
    response.cookies.delete('mock_role');
    response.cookies.delete('mock_user_id');
    return response;
}
