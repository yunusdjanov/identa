import { describe, expect, it, vi } from 'vitest';
import {
    clampCropRectToCanvas,
    drawCropOverlay,
    getSafeCropRectForRotation,
    renderEditedCanvas,
} from '@/components/patients/gallery-image-editor-canvas';

function createMockCanvasWithContext() {
    const context = {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        restore: vi.fn(),
        rotate: vi.fn(),
        save: vi.fn(),
        stroke: vi.fn(),
        strokeText: vi.fn(),
        translate: vi.fn(),
        set fillStyle(_value: string) {},
        set filter(_value: string) {},
        set font(_value: string) {},
        set lineCap(_value: CanvasLineCap) {},
        set lineJoin(_value: CanvasLineJoin) {},
        set lineWidth(_value: number) {},
        set strokeStyle(_value: string) {},
        set textBaseline(_value: CanvasTextBaseline) {},
    } as unknown as CanvasRenderingContext2D;

    const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;

    return { canvas, context };
}

function createMockCanvas(): HTMLCanvasElement {
    return createMockCanvasWithContext().canvas;
}

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

describe('getSafeCropRectForRotation', () => {
    it('keeps right-angle rotations uncropped', () => {
        expect(getSafeCropRectForRotation(300, 150, 90)).toEqual({
            x: 0,
            y: 0,
            width: 150,
            height: 300,
        });
    });

    it('returns a centered inset crop for straighten rotations', () => {
        const crop = getSafeCropRectForRotation(300, 150, 5);

        expect(crop.x).toBeGreaterThan(0);
        expect(crop.y).toBeGreaterThan(0);
        expect(crop.width).toBeGreaterThan(0);
        expect(crop.height).toBeGreaterThan(0);
        expect(crop.x + crop.width).toBeLessThanOrEqual(313);
        expect(crop.y + crop.height).toBeLessThanOrEqual(177);
    });
});

describe('renderEditedCanvas', () => {
    it('fails fast when the export surface is unavailable', () => {
        const outputCanvas = {
            getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement;
        const source = {
            naturalWidth: 100,
            naturalHeight: 50,
            width: 100,
            height: 50,
        } as HTMLImageElement;

        expect(() => renderEditedCanvas({
            canvas: outputCanvas,
            source,
            rotation: 0,
            brightness: 100,
            contrast: 100,
            cropRect: null,
            strokes: [],
            textAnnotations: [],
        })).toThrow('Canvas is unavailable.');
    });

    it('expands the export surface for arbitrary rotation degrees', () => {
        const outputCanvas = createMockCanvas();
        const internalCanvas = createMockCanvas();
        const source = {
            naturalWidth: 100,
            naturalHeight: 50,
            width: 100,
            height: 50,
        } as HTMLImageElement;
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((
            (tagName: string, options?: ElementCreationOptions) => {
                if (tagName.toLowerCase() === 'canvas') {
                    return internalCanvas;
                }

                return originalCreateElement(tagName, options);
            }
        ) as typeof document.createElement);

        renderEditedCanvas({
            canvas: outputCanvas,
            source,
            rotation: 45,
            brightness: 100,
            contrast: 100,
            cropRect: null,
            strokes: [],
            textAnnotations: [],
        });

        createElementSpy.mockRestore();
        expect(outputCanvas.width).toBe(107);
        expect(outputCanvas.height).toBe(107);
    });

    it('keeps malformed zero-sized source images exportable', () => {
        const outputCanvas = createMockCanvas();
        const internalCanvas = createMockCanvas();
        const source = {
            naturalWidth: 0,
            naturalHeight: 0,
            width: 0,
            height: 0,
        } as HTMLImageElement;
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((
            (tagName: string, options?: ElementCreationOptions) => {
                if (tagName.toLowerCase() === 'canvas') {
                    return internalCanvas;
                }

                return originalCreateElement(tagName, options);
            }
        ) as typeof document.createElement);

        renderEditedCanvas({
            canvas: outputCanvas,
            source,
            rotation: 0,
            brightness: 100,
            contrast: 100,
            cropRect: null,
            strokes: [],
            textAnnotations: [],
        });

        createElementSpy.mockRestore();
        expect(outputCanvas.width).toBe(1);
        expect(outputCanvas.height).toBe(1);
    });

    it('can render transparent previews without white rotation corners', () => {
        const { canvas: outputCanvas, context: outputContext } = createMockCanvasWithContext();
        const { canvas: internalCanvas, context: internalContext } = createMockCanvasWithContext();
        const source = {
            naturalWidth: 100,
            naturalHeight: 50,
            width: 100,
            height: 50,
        } as HTMLImageElement;
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((
            (tagName: string, options?: ElementCreationOptions) => {
                if (tagName.toLowerCase() === 'canvas') {
                    return internalCanvas;
                }

                return originalCreateElement(tagName, options);
            }
        ) as typeof document.createElement);

        renderEditedCanvas({
            canvas: outputCanvas,
            source,
            rotation: 30,
            brightness: 100,
            contrast: 100,
            cropRect: null,
            strokes: [],
            textAnnotations: [],
            backgroundColor: null,
        });

        createElementSpy.mockRestore();
        expect(internalContext.fillRect).not.toHaveBeenCalled();
        expect(outputContext.fillRect).not.toHaveBeenCalled();
    });
});
