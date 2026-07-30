import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientPhotoPreviewDialog } from '@/components/patients/patient-photo-preview-dialog';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const galleryEditorPropsMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/patients/gallery-image-editor', () => ({
    GalleryImageEditor: (props: {
        image: { src: string };
        onCancel: () => void;
        onSave: (file: File) => void;
        onSaveCopy?: (file: File) => void;
        onDirtyChange?: (dirty: boolean) => void;
    }) => {
        galleryEditorPropsMock(props);

        return (
        <div data-testid="mock-gallery-image-editor">
            <p>Brightness: 100%</p>
            <p>Contrast: 100%</p>
            <button type="button">Adjust</button>
            <button type="button">Crop</button>
            <button type="button">Draw</button>
            <button type="button">Text</button>
            <button type="button">Left</button>
            <button type="button">Right</button>
            <button type="button">Reset</button>
            <button type="button" onClick={() => props.onDirtyChange?.(true)}>Mark dirty</button>
            <button type="button" onClick={props.onCancel}>Cancel</button>
            <button type="button" onClick={() => props.onSave(new File(['edited'], 'edited.jpg'))}>Save</button>
            {props.onSaveCopy ? (
                <button type="button" onClick={() => props.onSaveCopy?.(new File(['copy'], 'copy.jpg'))}>Save copy</button>
            ) : null}
        </div>
        );
    },
}));

function buildImages(count: number) {
    return Array.from({ length: count }).map((_, index) => ({
        src: `https://example.com/image-${index + 1}.jpg`,
        thumbnailSrc: `https://example.com/image-${index + 1}-thumb.jpg`,
        alt: `Image ${index + 1}`,
        title: `Image ${index + 1}`,
    }));
}

function wrapper({ children }: { children: React.ReactNode }) {
    return (
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            {children}
        </I18nProvider>
    );
}

describe('PatientPhotoPreviewDialog', () => {
    afterEach(() => {
        cleanup();
        galleryEditorPropsMock.mockReset();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders and navigates a 10-image gallery', async () => {
        const user = userEvent.setup();
        const images = buildImages(10);

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={images}
                startIndex={0}
            />,
            { wrapper }
        );

        expect(screen.getByRole('dialog').className).toContain('!h-[100dvh]');
        expect(screen.getByRole('dialog').className).toContain('bg-slate-950');
        expect(screen.getByRole('heading', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
        expect(screen.getByTestId('patient-photo-preview-actions')).toHaveClass(
            'overflow-x-auto',
            'sm:overflow-visible'
        );
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('1 / 10')).toBeInTheDocument();
        expect(screen.getByLabelText('Image thumbnails').className).toContain('w-fit');
        expect(screen.getByLabelText('Image thumbnails').className).toContain('overflow-x-auto');
        expect(screen.getByLabelText('Image thumbnails').parentElement?.className).toContain('border-white/10');
        expect(document.querySelector('img[src="https://example.com/image-1.jpg"]')).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/image-1-thumb.jpg"]')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /next image/i }));
        expect(screen.getByRole('heading', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByText('2 / 10')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /previous image/i }));
        expect(screen.getByRole('heading', { name: 'Image 1' })).toBeInTheDocument();
    });

    it('zooms the active image and resets zoom when navigating', async () => {
        const user = userEvent.setup();
        const images = buildImages(2);

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={images}
                startIndex={0}
            />,
            { wrapper }
        );

        const activeImage = document.querySelector('img[src="https://example.com/image-1.jpg"]');
        expect(activeImage).toHaveStyle({ transform: 'scale(1)' });

        await user.click(screen.getByRole('button', { name: 'Zoom in' }));

        expect(screen.getByText('125%')).toBeInTheDocument();
        expect(activeImage).toHaveStyle({ transform: 'scale(1.25)' });
        expect(screen.getByRole('button', { name: 'Zoom out' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: /next image/i }));

        expect(screen.getByRole('heading', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/image-2.jpg"]'))
            .toHaveStyle({ transform: 'scale(1)' });
    });

    it('jumps to selected thumbnail', async () => {
        const user = userEvent.setup();
        const images = buildImages(10);

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={images}
                startIndex={0}
            />,
            { wrapper }
        );

        const thumbnailButtons = screen
            .getAllByRole('button')
            .filter((button) => button.getAttribute('title')?.startsWith('Image '));

        expect(thumbnailButtons).toHaveLength(10);

        await user.click(thumbnailButtons[9]);
        expect(screen.getByRole('heading', { name: 'Image 10' })).toBeInTheDocument();
        expect(screen.getByText('10 / 10')).toBeInTheDocument();
    });

    it('starts at the requested gallery image', () => {
        const images = buildImages(10);

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={images}
                startIndex={4}
            />,
            { wrapper }
        );

        expect(screen.getByRole('heading', { name: 'Image 5' })).toBeInTheDocument();
        expect(screen.getByText('5 / 10')).toBeInTheDocument();
    });

    it('opens edit controls only when an edit save handler is available', async () => {
        const user = userEvent.setup();
        const images = buildImages(1);

        const { rerender } = render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={images}
                startIndex={0}
            />,
            { wrapper }
        );

        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

        rerender(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <PatientPhotoPreviewDialog
                    open={true}
                    onOpenChange={() => {}}
                    alt="Image"
                    title="Gallery"
                    images={images}
                    startIndex={0}
                    onSaveEditedImage={vi.fn()}
                />
            </I18nProvider>
        );

        await user.click(screen.getByRole('button', { name: 'Edit' }));

        expect(screen.getByText('Brightness: 100%')).toBeInTheDocument();
        expect(screen.getByText('Contrast: 100%')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Adjust' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Crop' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('edits and downloads the protected full-resolution source', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(new Blob(['image'], { type: 'image/jpeg' })),
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={() => {}}
                alt="Image"
                title="Gallery"
                images={[{
                    src: 'https://cdn.example.com/preview.jpg',
                    editSrc: '/api/v1/patients/1/photo?v=2',
                    downloadSrc: '/api/v1/patients/1/photo?v=2',
                    alt: 'Patient',
                }]}
                onSaveEditedImage={vi.fn()}
            />,
            { wrapper }
        );

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        expect(galleryEditorPropsMock.mock.calls.at(-1)?.[0].image.src)
            .toBe('/api/v1/patients/1/photo?v=2');

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await user.click(screen.getByRole('button', { name: 'Download image' }));
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/v1/patients/1/photo?v=2',
            expect.objectContaining({ credentials: 'same-origin' })
        );
    });

    it('confirms before discarding dirty edits and supports saving a copy', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        const onSaveEditedCopy = vi.fn();

        render(
            <PatientPhotoPreviewDialog
                open={true}
                onOpenChange={onOpenChange}
                alt="Image"
                title="Gallery"
                images={buildImages(1)}
                onSaveEditedImage={vi.fn()}
                onSaveEditedCopy={onSaveEditedCopy}
            />,
            { wrapper }
        );

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await user.click(screen.getByRole('button', { name: 'Mark dirty' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.getByText('Discard changes?')).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        await user.click(screen.getByRole('button', { name: 'Keep editing' }));
        await user.click(screen.getByRole('button', { name: 'Save copy' }));

        expect(onSaveEditedCopy).toHaveBeenCalledWith(
            expect.objectContaining({ src: 'https://example.com/image-1.jpg' }),
            expect.any(File)
        );
    });
});
