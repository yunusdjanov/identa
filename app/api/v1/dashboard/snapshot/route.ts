import { NextResponse } from 'next/server';
import { canViewFinancials, requirePermission } from '../../_auth';

function pad(n: number) { return String(n).padStart(2, '0'); }
function t(h: number, m: number) { return `${pad(Math.min(h, 23))}:${pad(m)}`; }

export async function GET() {
    // Backend gates `/dashboard/snapshot` with
    // `appointments.view|payments.view` (routes/api.php line 155).
    // A zero-perm assistant gets 403 in production; the mock used to let
    // them through with an empty inline auth check.
    const denied = await requirePermission('appointments.view', 'payments.view');
    if (denied) return denied;

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const h = now.getHours();
    const canSeeFinancials = await canViewFinancials();

    // Mirror DashboardService::snapshot — backend returns exactly these
    // three keys. The previous mock included `revenueByMonth`,
    // `patientGrowth`, `appointmentStatus`, `topTreatments` extras, but
    // the analytics page (the only frontend consumer of those shapes)
    // computes them locally from /patients + /appointments + /payments,
    // so the snapshot extras were dead in production AND mock. Strip
    // them so a future test asserting "no extra keys" doesn't diverge
    // between mock and real backend. Without payments.view the financial
    // totals collapse to 0 (matches backend's conditional gating).
    return NextResponse.json({
        data: {
            revenueThisMonth: canSeeFinancials ? 4_850_000 : 0,
            outstandingDebtTotal: canSeeFinancials ? 1_200_000 : 0,
            todayAppointments: [
                { id: '1', patientName: 'Alisher Karimov',  appointmentDate: date, startTime: t(h - 2, 0),  durationMinutes: 45, status: 'completed', reason: "Tish og'riq" },
                { id: '2', patientName: 'Malika Yusupova',  appointmentDate: date, startTime: t(h + 1, 0),  durationMinutes: 60, status: 'scheduled', reason: 'Tish tozalash' },
                { id: '3', patientName: 'Bobur Rahimov',    appointmentDate: date, startTime: t(h + 2, 30), durationMinutes: 30, status: 'scheduled', reason: "Ko'rik" },
                { id: '4', patientName: 'Nilufar Hasanova', appointmentDate: date, startTime: t(h + 3, 0),  durationMinutes: 90, status: 'scheduled', reason: 'Implant' },
            ],
        },
    });
}
