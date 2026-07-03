import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryImageEditor, clampCropTransformBox } from '@/components/patients/gallery-image-editor';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const loadEditableImageMock = vi.hoisted(() => vi.fn());
const renderEditedCanvasMock = vi.hoisted(() => vi.fn());
const createEditedImageFileMock = vi.hoisted(() => vi.fn());

vi.mock('react-konva', async () => {
    const React = await vi.importActual<typeof import('react')>('react');

    type MockKonvaEventHandler = (event: {
        evt: MouseEvent;
        cancelBubble: boolean;
        target: { name: () => string };
    }) => void;

    interface MockStageProps {
        width: number;
        height: number;
        children?: React.ReactNode;
        'data-testid'?: string;
        onMouseDown?: MockKonvaEventHandler;
        onMouseMove?: MockKonvaEventHandler;
        onMouseUp?: () => void;
        onMouseLeave?: () => void;
    }

    interface MockRectProps {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        name?: string;
        onMouseDown?: MockKonvaEventHandler;
        onDragEnd?: () => void;
        onTransformEnd?: () => void;
    }

    const Stage = React.forwardRef(function MockStage(
        { children, height, onMouseDown, onMouseLeave, onMouseMove, onMouseUp, width, ...props }: MockStageProps,
        ref: React.ForwardedRef<{ getPointerPosition: () => { x: number; y: number } | null }>
    ) {
        const pointerRef = React.useRef<{ x: number; y: number } | null>(null);
        const stageApi = {
            getPointerPosition: () => pointerRef.current,
            name: () => '',
        };
        React.useImperativeHandle(ref, () => stageApi);

        const toKonvaEvent = (event: React.MouseEvent<HTMLDivElement>): Parameters<MockKonvaEventHandler>[0] => {
            pointerRef.current = { x: event.clientX, y: event.clientY };
            return {
                evt: event.nativeEvent,
                cancelBubble: false,
                target: stageApi,
            };
        };

        return (
            <div
                data-testid={props['data-testid']}
                style={{ height, width }}
                onMouseDown={(event) => onMouseDown?.(toKonvaEvent(event))}
                onMouseMove={(event) => onMouseMove?.(toKonvaEvent(event))}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
            >
                {children}
            </div>
        );
    });

    const Rect = React.forwardRef(function MockRect(
        { name, onDragEnd, onMouseDown, onTransformEnd, ...props }: MockRectProps,
        ref: React.ForwardedRef<{
            x: () => number;
            y: () => number;
            width: () => number;
            height: () => number;
            scaleX: () => number;
            scaleY: () => number;
        }>
    ) {
        React.useImperativeHandle(ref, () => ({
            x: () => props.x ?? 0,
            y: () => props.y ?? 0,
            width: () => props.width ?? 0,
            height: () => props.height ?? 0,
            scaleX: () => 1,
            scaleY: () => 1,
        }));

        return (
            <div
                data-testid={name === 'crop-rect' ? 'konva-crop-rect' : 'konva-rect'}
                onMouseDown={(event) => onMouseDown?.({
                    evt: event.nativeEvent,
                    cancelBubble: false,
                    target: { name: () => name ?? '' },
                })}
                onDoubleClick={() => {
                    onDragEnd?.();
                    onTransformEnd?.();
                }}
            />
        );
    });

    const Transformer = React.forwardRef(function MockTransformer(
        _props: Record<string, unknown>,
        ref: React.ForwardedRef<{
            nodes: (nodes: unknown[]) => void;
            getLayer: () => { batchDraw: () => void };
        }>
    ) {
        React.useImperativeHandle(ref, () => ({
            nodes: vi.fn(),
            getLayer: () => ({ batchDraw: vi.fn() }),
        }));

        return <div data-testid="konva-transformer" />;
    });

    return {
        Image: ({ name }: { name?: string }) => <div data-testid={name === 'base-image' ? 'konva-base-image' : 'konva-image'} />,
        Layer: ({ children }: { children?: React.ReactNode }) => <div data-testid="konva-layer">{children}</div>,
        Line: ({ points }: { points: number[] }) => <div data-testid="konva-line" data-points={JSON.stringify(points)} />,
        Rect,
        Stage,
        Text: ({ text }: { text: string }) => <div data-testid="konva-text">{text}</div>,
        Transformer,
    };
});

vi.mock('@/components/patients/gallery-image-editor-canvas', async () => {
    const actual = await vi.importActual<typeof import('@/components/patients/gallery-image-editor-canvas')>(
        '@/components/patients/gallery-image-editor-canvas'
    );

    return {
        ...actual,
        loadEditableImage: loadEditableImageMock,
        renderEditedCanvas: renderEditedCanvasMock,
        createEditedImageFile: createEditedImageFileMock,
    };
});

function buildLoadedImage() {
    const image = new Image();
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 300 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 150 });
    Object.defineProperty(image, 'width', { configurable: true, value: 300 });
    Object.defineProperty(image, 'height', { configurable: true, value: 150 });

    return image;
}

function renderEditor(onSave = vi.fn()) {
    return render(
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            <GalleryImageEditor
                image={{ src: 'https://example.com/photo.jpg', alt: 'Clinical photo', title: 'Clinical photo' }}
                onCancel={vi.fn()}
                onSave={onSave}
            />
        </I18nProvider>
    );
}

describe('GalleryImageEditor', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        loadEditableImageMock.mockReset();
        renderEditedCanvasMock.mockReset();
        createEditedImageFileMock.mockReset();
        loadEditableImageMock.mockResolvedValue(buildLoadedImage());
        renderEditedCanvasMock.mockImplementation(({ canvas }: { canvas: HTMLCanvasElement }) => {
            canvas.width = 300;
            canvas.height = 150;
        });
        createEditedImageFileMock.mockResolvedValue(new File(['edited'], 'edited.jpg', { type: 'image/jpeg' }));

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    });

    it('adds text directly where the user clicks on the image', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        renderEditor(onSave);

        const textModeButton = await screen.findByRole('button', { name: 'Text' });
        await waitFor(() => expect(textModeButton).toBeEnabled());
        await user.click(textModeButton);

        expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();

        const stage = screen.getByTestId('gallery-image-editor-stage');
        fireEvent.mouseDown(stage, { clientX: 75, clientY: 30 });

        const inlineTextInput = screen.getByRole('textbox', { name: 'Text' });
        await user.type(inlineTextInput, 'Plaque');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(createEditedImageFileMock).toHaveBeenCalledWith(expect.objectContaining({
            textAnnotations: [
                expect.objectContaining({
                    text: 'Plaque',
                    x: 75,
                    y: 30,
                }),
            ],
        }));
        expect(onSave).toHaveBeenCalledWith(expect.any(File));
    });

    it('draws on the actual pointer location without offset drift', async () => {
        const user = userEvent.setup();
        renderEditor();

        const drawModeButton = await screen.findByRole('button', { name: 'Draw' });
        await waitFor(() => expect(drawModeButton).toBeEnabled());
        await user.click(drawModeButton);

        const stage = screen.getByTestId('gallery-image-editor-stage');
        fireEvent.mouseDown(stage, { clientX: 40, clientY: 20 });
        fireEvent.mouseMove(stage, { clientX: 90, clientY: 70 });
        fireEvent.mouseUp(stage, { clientX: 90, clientY: 70 });

        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(createEditedImageFileMock).toHaveBeenCalledWith(expect.objectContaining({
            strokes: [
                expect.objectContaining({
                    points: [
                        { x: 40, y: 20 },
                        { x: 90, y: 70 },
                    ],
                }),
            ],
        }));
    });

    it('shows the real save failure reason from the replacement upload flow', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockRejectedValue(new Error('Edited photo is too large.'));
        renderEditor(onSave);

        const saveButton = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(saveButton).toBeEnabled());
        await user.click(saveButton);

        expect(onSave).toHaveBeenCalledWith(expect.any(File));
        expect(await screen.findByText('Edited photo is too large.')).toBeInTheDocument();
    });

    it('keeps edited-photo save single-flight while the replacement upload is pending', async () => {
        const user = userEvent.setup();
        let resolveSave: () => void = () => undefined;
        const onSave = vi.fn(() => new Promise<void>((resolve) => {
            resolveSave = resolve;
        }));
        renderEditor(onSave);

        const saveButton = await screen.findByRole('button', { name: 'Save' });
        await waitFor(() => expect(saveButton).toBeEnabled());

        await user.dblClick(saveButton);

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(createEditedImageFileMock).toHaveBeenCalledTimes(1);

        resolveSave();
        await waitFor(() => expect(saveButton).toBeEnabled());
    });

    it('uses a transformer-backed crop selection before applying it', async () => {
        const user = userEvent.setup();
        renderEditor();

        const cropModeButton = await screen.findByRole('button', { name: 'Crop' });
        await waitFor(() => expect(cropModeButton).toBeEnabled());
        await user.click(cropModeButton);

        const stage = screen.getByTestId('gallery-image-editor-stage');
        fireEvent.mouseDown(stage, { clientX: 30, clientY: 30 });
        fireEvent.mouseMove(stage, { clientX: 180, clientY: 100 });
        fireEvent.mouseUp(stage, { clientX: 180, clientY: 100 });

        expect(screen.getByTestId('konva-transformer')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Apply crop' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(createEditedImageFileMock).toHaveBeenCalledWith(expect.objectContaining({
            cropRect: expect.objectContaining({
                x: 30,
                y: 30,
                width: 150,
                height: 70,
            }),
        }));
    });

    it('saves an active crop selection even before the user applies it', async () => {
        const user = userEvent.setup();
        renderEditor();

        const cropModeButton = await screen.findByRole('button', { name: 'Crop' });
        await waitFor(() => expect(cropModeButton).toBeEnabled());
        await user.click(cropModeButton);

        const stage = screen.getByTestId('gallery-image-editor-stage');
        fireEvent.mouseDown(stage, { clientX: 45, clientY: 20 });
        fireEvent.mouseMove(stage, { clientX: 210, clientY: 130 });
        fireEvent.mouseUp(stage, { clientX: 210, clientY: 130 });

        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(createEditedImageFileMock).toHaveBeenCalledWith(expect.objectContaining({
            cropRect: expect.objectContaining({
                x: 45,
                y: 20,
                width: 165,
                height: 110,
            }),
        }));
    });

    it('clamps crop transformer resizes at image edges instead of rejecting them', () => {
        expect(clampCropTransformBox({ x: 260, y: 120, width: 90, height: 45 }, 300, 150, 16)).toEqual({
            x: 210,
            y: 105,
            width: 90,
            height: 45,
        });
        expect(clampCropTransformBox({ x: 25, y: 20, width: -80, height: -40 }, 300, 150, 16)).toEqual({
            x: 0,
            y: 0,
            width: 80,
            height: 40,
        });
    });

    it('keeps manual rotation hidden while quick rotate actions remain available', async () => {
        renderEditor();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Right' })).toBeEnabled());

        expect(screen.queryByRole('spinbutton', { name: 'Rotation' })).not.toBeInTheDocument();
        expect(screen.queryByText('Rotation')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument();
    });

    it('drops a transient crop selection when rotation changes', async () => {
        const user = userEvent.setup();
        renderEditor();

        const cropModeButton = await screen.findByRole('button', { name: 'Crop' });
        await waitFor(() => expect(cropModeButton).toBeEnabled());
        await user.click(cropModeButton);

        const stage = screen.getByTestId('gallery-image-editor-stage');
        fireEvent.mouseDown(stage, { clientX: 40, clientY: 30 });
        fireEvent.mouseMove(stage, { clientX: 200, clientY: 120 });
        fireEvent.mouseUp(stage, { clientX: 200, clientY: 120 });

        await user.click(screen.getByRole('button', { name: 'Right' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(createEditedImageFileMock).toHaveBeenCalledWith(expect.objectContaining({
            cropRect: null,
            rotation: 90,
        }));
    });
});
