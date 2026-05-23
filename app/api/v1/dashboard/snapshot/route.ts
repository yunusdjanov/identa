import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function pad(n: number) { return String(n).padStart(2, '0'); }
function t(h: number, m: number) { return `${pad(Math.min(h, 23))}:${pad(m)}`; }

export async function GET() {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const h = now.getHours();

    return NextResponse.json({
        data: {
            revenueThisMonth: 4_850_000,
            outstandingDebtTotal: 1_200_000,
            todayAppointments: [
                { id: '1', patientName: 'Alisher Karimov',  appointmentDate: date, startTime: t(h - 2, 0),  durationMinutes: 45, status: 'completed', reason: "Tish og'riq" },
                { id: '2', patientName: 'Malika Yusupova',  appointmentDate: date, startTime: t(h + 1, 0),  durationMinutes: 60, status: 'scheduled', reason: 'Tish tozalash' },
                { id: '3', patientName: 'Bobur Rahimov',    appointmentDate: date, startTime: t(h + 2, 30), durationMinutes: 30, status: 'scheduled', reason: "Ko'rik" },
                { id: '4', patientName: 'Nilufar Hasanova', appointmentDate: date, startTime: t(h + 3, 0),  durationMinutes: 90, status: 'scheduled', reason: 'Implant' },
            ],
        },
    });
}
