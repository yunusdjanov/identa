import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OverlayLayerProvider } from '@/components/ui/overlay-layer-context';

describe('DropdownMenu', () => {
    afterEach(cleanup);

    it('keeps page menus at the normal overlay level', () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Open</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Item</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );

        expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toHaveClass('z-50');
    });

    it('raises dialog menus above the dialog overlay', () => {
        render(
            <OverlayLayerProvider layer="dialog">
                <DropdownMenu defaultOpen>
                    <DropdownMenuTrigger>Open</DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem>Item</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </OverlayLayerProvider>
        );

        expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toHaveClass('z-[70]');
    });
});
