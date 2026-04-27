import { Metadata } from 'next';
import { ErrorScreen } from '@/components/error/error-screen';

export const metadata: Metadata = {
  title: 'Страница не найдена | Identa',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return <ErrorScreen kind="not-found" />;
}
