import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

describe('Select', () => {
    afterEach(() => {
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
});
