import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Verify email',
    alternates: { canonical: '/verify-email' },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
    return children;
}
