import { Metadata } from 'next';
import { ErrorScreen } from '@/components/error/error-screen';

export const metadata: Metadata = {
    title: 'Доступ закрыт | Identa',
    robots: {
        index: false,
        follow: false,
    },
};

export default function ForbiddenPage() {
    return <ErrorScreen kind="forbidden" />;
}
