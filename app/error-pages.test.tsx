import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotFound from '@/app/not-found';
import Forbidden from '@/app/forbidden';
import ForbiddenPage from '@/app/403/page';
import AccessDeniedPage from '@/app/access-denied/page';
import ErrorBoundary from '@/app/error';
import GlobalError from '@/app/global-error';

beforeEach(() => {
    document.cookie = 'identa_locale=en; path=/';
});

afterEach(() => {
    cleanup();
    document.cookie = 'identa_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('error route wrappers', () => {
    it('not-found renders the 404 screen', () => {
        render(<NotFound />);
        expect(screen.getByText('404')).toBeInTheDocument();
    });

    it('forbidden renders the 403 screen', () => {
        render(<Forbidden />);
        expect(screen.getByText('403')).toBeInTheDocument();
    });

    it('/403 renders the 403 screen', () => {
        render(<ForbiddenPage />);
        expect(screen.getByText('403')).toBeInTheDocument();
    });

    it('/access-denied renders the 403 screen', () => {
        render(<AccessDeniedPage />);
        expect(screen.getByText('403')).toBeInTheDocument();
    });

    it('error boundary renders the route-error screen and wires retry', () => {
        const reset = vi.fn();
        render(<ErrorBoundary error={Object.assign(new Error('x'), { digest: 'dg-1' })} reset={reset} />);
        expect(screen.getByText('500')).toBeInTheDocument();
        expect(screen.getByText('dg-1')).toBeInTheDocument();
    });

    it('global-error renders the global-error screen', () => {
        const reset = vi.fn();
        const { container } = render(
            <GlobalError error={Object.assign(new Error('x'), { digest: 'dg-2' })} reset={reset} />
        );
        expect(within(container).getByText('500')).toBeInTheDocument();
    });
});
