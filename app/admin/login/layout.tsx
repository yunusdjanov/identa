import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Admin sign in',
    alternates: { canonical: '/admin/login' },
    robots: {
        index: false,
        follow: false,
        noarchive: true,
    },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
