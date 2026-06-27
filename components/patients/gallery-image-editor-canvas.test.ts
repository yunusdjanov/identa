import { describe, expect, it, vi } from 'vitest';
import { clampCropRectToCanvas, drawCropOverlay } from '@/components/patients/gallery-image-editor-canvas';

describe('clampCropRectToCanvas', () => {
    it('keeps export crop rectangles inside the rendered canvas', () => {
        expect(clampCropRectToCanvas({ x: -10, y: 5, width: 50, height: 90 }, 100, 80)).toEqual({
            x: 0,
            y: 5,
            width: 40,
            height: 75,
        });
        expect(clampCropRectToCanvas({ x: 80, y: 60, width: 60, height: 40 }, 100, 80)).toEqual({
            x: 80,
            y: 60,
            width: 20,
            height: 20,
        });
    });

    it('falls back to the full canvas when the crop is empty', () => {
        expect(clampCropRectToCanvas(null, 100, 80)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
        expect(clampCropRectToCanvas({ x: 10, y: 10, width: 0, height: 20 }, 100, 80)).toEqual({
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        });
    });
});

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
