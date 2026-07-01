import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { OverlayLayerProvider } from '@/components/ui/overlay-layer-context';

describe('Select', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('keeps trigger focus scroll below sticky app headers', () => {
        render(
            <Select defaultValue="uzs">
                <SelectTrigger aria-label="Currency">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="uzs">UZS</SelectItem>
                </SelectContent>
            </Select>
        );

        expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveClass('scroll-mt-24');
    });

    it('uses popper positioning by default to avoid page-jumping item alignment', () => {
        render(
            <Select defaultValue="uzs" defaultOpen>
                <SelectTrigger aria-label="Currency">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="uzs">UZS</SelectItem>
                </SelectContent>
            </Select>
        );

        expect(document.querySelector('[data-slot="select-viewport"]')).toHaveClass(
            'h-[var(--radix-select-trigger-height)]',
            'min-w-[var(--radix-select-trigger-width)]'
        );
    });

    it('keeps page-level menus below the sticky app header', () => {
        render(
            <Select defaultValue="uzs" defaultOpen>
                <SelectTrigger aria-label="Currency">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="uzs">UZS</SelectItem>
                </SelectContent>
            </Select>
        );

        expect(document.querySelector('[data-slot="select-content"]')).toHaveClass('z-40');
    });

    it('raises dialog select menus above dialog content', () => {
        render(
            <OverlayLayerProvider layer="dialog">
                <Select defaultValue="uzs" defaultOpen>
                    <SelectTrigger aria-label="Currency">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="uzs">UZS</SelectItem>
                    </SelectContent>
                </Select>
            </OverlayLayerProvider>
        );

        expect(document.querySelector('[data-slot="select-content"]')).toHaveClass('z-[70]');
    });

    it('restores document scroll when opening the menu', () => {
        Object.defineProperty(window, 'scrollX', { configurable: true, value: 12 });
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
        const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 1;
        });

        render(
            <Select defaultValue="uzs">
                <SelectTrigger aria-label="Currency">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="uzs">UZS</SelectItem>
                </SelectContent>
            </Select>
        );

        fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Currency' }), {
            button: 0,
            ctrlKey: false,
            pointerType: 'mouse',
        });

        expect(scrollTo).toHaveBeenCalledWith(12, 240);
    });
});
