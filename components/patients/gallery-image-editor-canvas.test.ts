import { describe, expect, it, vi } from 'vitest';
import { drawCropOverlay } from '@/components/patients/gallery-image-editor-canvas';

describe('drawCropOverlay', () => {
    it('dims only the area outside the crop rectangle', () => {
        const fillRect = vi.fn();
        const clearRect = vi.fn();
        const strokeRect = vi.fn();
        const context = {
            save: vi.fn(),
            restore: vi.fn(),
            fillRect,
            clearRect,
            strokeRect,
            set fillStyle(_value: string) {},
            set strokeStyle(_value: string) {},
            set lineWidth(_value: number) {},
        } as unknown as CanvasRenderingContext2D;

        drawCropOverlay(context, 100, 80, { x: 20, y: 10, width: 30, height: 40 });

        expect(clearRect).not.toHaveBeenCalled();
        expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 10);
        expect(fillRect).toHaveBeenCalledWith(0, 50, 100, 30);
        expect(fillRect).toHaveBeenCalledWith(0, 10, 20, 40);
        expect(fillRect).toHaveBeenCalledWith(50, 10, 50, 40);
        expect(strokeRect).toHaveBeenCalledWith(20, 10, 30, 40);
    });
});
