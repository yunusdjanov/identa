export interface StatusTone {
    dot: string;
    text: string;
}

export function getStatusTone(status: string): StatusTone {
    switch (status) {
        case 'completed':
            return { dot: 'bg-teal-500', text: 'text-teal-700' };
        case 'cancelled':
            return { dot: 'bg-slate-700', text: 'text-slate-800' };
        case 'no_show':
            return { dot: 'bg-rose-500', text: 'text-rose-700' };
        case 'scheduled':
        default:
            return { dot: 'bg-blue-500', text: 'text-blue-700' };
    }
}
