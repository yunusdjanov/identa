import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorScreen } from '@/components/error/error-screen';

function setLocaleCookie(locale: string) {
    document.cookie = `identa_locale=${locale}; path=/`;
}

afterEach(() => {
    cleanup();
    document.cookie = 'identa_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('ErrorScreen', () => {
    it('renders the not-found copy with its status code (English locale)', () => {
        setLocaleCookie('en');
        render(<ErrorScreen kind="not-found" />);
        expect(screen.getByText('404')).toBeInTheDocument();
        expect(screen.getByText("This page doesn't exist")).toBeInTheDocument();
    });

    it('renders a retry action that calls onRetry (route-error)', () => {
        setLocaleCookie('en');
        const onRetry = vi.fn();
        render(<ErrorScreen kind="route-error" onRetry={onRetry} />);
        const retry = screen.getByRole('button', { name: 'Try again' });
        fireEvent.click(retry);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('renders the forbidden status code', () => {
        setLocaleCookie('en');
        render(<ErrorScreen kind="forbidden" />);
        expect(screen.getByText('403')).toBeInTheDocument();
        expect(screen.getByText("You don't have access")).toBeInTheDocument();
    });

    it('localizes copy from the identa_locale cookie (Russian)', () => {
        setLocaleCookie('ru');
        render(<ErrorScreen kind="not-found" />);
        expect(screen.getByText('Такой страницы нет')).toBeInTheDocument();
    });

    it('localizes copy from the identa_locale cookie (Uzbek)', () => {
        setLocaleCookie('uz');
        render(<ErrorScreen kind="not-found" />);
        expect(screen.getByText('Bunday sahifa yoʻq')).toBeInTheDocument();
    });

    it('shows a localized error-code label when a digest is provided', () => {
        setLocaleCookie('en');
        render(<ErrorScreen kind="global-error" digest="abc123" />);
        expect(screen.getByText('abc123')).toBeInTheDocument();
        expect(screen.getByText(/Error code:/)).toBeInTheDocument();
    });

    it('uses an explicit locale supplied by the global error document', () => {
        setLocaleCookie('ru');
        render(<ErrorScreen kind="global-error" localeOverride="uz" />);
        expect(screen.getByText('Identa ishga tushmadi')).toBeInTheDocument();
    });
});
