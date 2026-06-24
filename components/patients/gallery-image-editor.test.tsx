import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryImageEditor } from '@/components/patients/gallery-image-editor';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const loadEditableImageMock = vi.hoisted(() => vi.fn());
const renderEditedCanvasMock = vi.hoisted(() => vi.fn());
const createEditedImageFileMock = vi.hoisted(() => vi.fn());

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

        Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 150,
                width: 300,
                height: 150,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });
    });

    it('adds text directly on the canvas instead of using a toolbar text field', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        renderEditor(onSave);

        const textModeButton = await screen.findByRole('button', { name: 'Text' });
        await waitFor(() => expect(textModeButton).toBeEnabled());
        await user.click(textModeButton);

        expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();

        const canvas = screen.getByLabelText('Clinical photo');
        fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 75, clientY: 30 });

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
});
