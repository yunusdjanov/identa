import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function pad(n: number) { return String(n).padStart(2, '0'); }
function t(h: number, m: number) { return `${pad(Math.min(h, 23))}:${pad(m)}`; }

function monthLabel(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short' });
}

function buildRevenueByMonth(): Array<{ month: string; revenue: number; debt: number }> {
    const now = new Date();
    const series: Array<{ month: string; revenue: number; debt: number }> = [];
    const revenuePoints = [2_300_000, 2_950_000, 3_500_000, 4_100_000, 3_850_000, 4_850_000];
    const debtPoints = [800_000, 950_000, 1_100_000, 1_350_000, 1_250_000, 1_200_000];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        series.push({
            month: monthLabel(d),
            revenue: revenuePoints[5 - i],
            debt: debtPoints[5 - i],
        });
    }
    return series;
}

function buildPatientGrowth(): Array<{ month: string; total: number; new: number }> {
    const now = new Date();
    const series: Array<{ month: string; total: number; new: number }> = [];
    const totalPoints = [18, 24, 31, 38, 46, 54];
    const newPoints = [6, 6, 7, 7, 8, 8];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        series.push({
            month: monthLabel(d),
            total: totalPoints[5 - i],
            new: newPoints[5 - i],
        });
    }
    return series;
}

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
            revenueByMonth: buildRevenueByMonth(),
            patientGrowth: buildPatientGrowth(),
            appointmentStatus: [
                { status: 'completed', count: 42 },
                { status: 'scheduled', count: 18 },
                { status: 'cancelled', count: 5 },
                { status: 'no_show', count: 3 },
            ],
            topTreatments: [
                { name: 'Tish tozalash (ultratovush)', count: 24, revenue: 3_600_000 },
                { name: "Dolg to'ldirish", count: 18, revenue: 6_300_000 },
                { name: 'Metall-keramik toj', count: 8, revenue: 12_000_000 },
                { name: 'Implant (Nobel Biocare)', count: 4, revenue: 18_000_000 },
                { name: 'Tishlarni oqartirish', count: 6, revenue: 5_100_000 },
            ],
        },
    });
}
