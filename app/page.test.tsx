import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Landing } from '@/components/landing/landing';

const landingCss = readFileSync(join(process.cwd(), 'app', 'landing.css'), 'utf8');

// The marketing landing is now a native, server-rendered React tree (no iframe,
// no CDN bundle). next/font is wired in app/page.tsx, so the component itself is
// font-agnostic and can be rendered directly here.
describe('Landing', () => {
    afterEach(() => {
        cleanup();
        // The language switcher persists to localStorage; clear it so the
        // default-locale assertions stay deterministic across tests.
        window.localStorage.clear();
    });

    it('renders the hero, sections and CTAs in the default (Russian) locale', () => {
        render(<Landing />);

        // Hero CTA (also repeated in the closing CTA section)
        expect(screen.getAllByRole('link', { name: 'Начать бесплатно' }).length).toBeGreaterThan(0);
        // Section headings present (real, crawlable content — not an iframe)
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        // Nav + pricing + faq anchors
        expect(screen.getAllByText('Тарифы').length).toBeGreaterThan(0);
        // Register links point at the app signup
        const registerLinks = screen.getAllByRole('link', { name: /Начать бесплатно|Выбрать базовый/ });
        expect(registerLinks[0]).toHaveAttribute('href', '/register');
    });

    it('keeps the Russian hero accent as one balanced phrase', () => {
        render(<Landing />);

        const heading = screen.getByRole('heading', { level: 1 });
        const accentParts = heading.querySelectorAll('em');

        expect(accentParts).toHaveLength(1);
        expect(accentParts[0].textContent).toBe('собранная в\u00a0одной системе.');
        expect(heading.textContent).toBe('Стоматология, собранная в\u00a0одной системе.');
    });

    it('switches all content when another language is selected', async () => {
        const user = userEvent.setup();
        render(<Landing />);

        const langTabs = screen.getAllByRole('tablist', { name: 'Language' })[0];
        await user.click(within(langTabs).getByRole('tab', { name: 'en' }));

        // English hero CTA now renders; the Russian one is gone
        expect(screen.getAllByRole('link', { name: 'Start free' }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: 'Начать бесплатно' })).not.toBeInTheDocument();
    });

    it('exposes an accessible language switcher', () => {
        render(<Landing />);
        const langTabs = screen.getAllByRole('tablist', { name: 'Language' })[0];
        expect(within(langTabs).getByRole('tab', { name: 'ru' })).toHaveAttribute('aria-selected', 'true');
    });

    it('uses full document navigation for app entry links', () => {
        const { container } = render(<Landing />);

        const appEntryLinks = Array.from(container.querySelectorAll('a[href="/login"], a[href="/register"]'));
        expect(appEntryLinks.length).toBeGreaterThan(0);
        appEntryLinks.forEach((link) => {
            expect(link).toHaveAttribute('data-navigation', 'document');
        });
    });

    it('keeps the desktop hero eyebrow stable before font cache warms', () => {
        expect(landingCss).toContain('@media (min-width: 1280px)');
        expect(landingCss).toContain('flex-wrap: nowrap');
        expect(landingCss).toContain('white-space: nowrap');
    });
});
