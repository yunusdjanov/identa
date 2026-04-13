import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PatientPhotoPreviewDialog } from '@/components/patients/patient-photo-preview-dialog';

function buildImages(count: number) {
    return Array.from({ length: count }).map((_, index) => ({
        src: `https://example.com/image-${index + 1}.jpg`,
        thumbnailSrc: `https://example.com/image-${index + 1}-thumb.jpg`,
        alt: `Image ${index + 1}`,
        title: `Image ${index + 1}`,
    }));
}

describe('PatientPhotoPreviewDialog', () => {
    afterEach(() => {
        cleanup();
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
            />
        );

        expect(screen.getByRole('dialog').className).toContain('h-[min(88vh,720px)]');
        expect(screen.getByRole('heading', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        expect(screen.getByText('1 / 10')).toBeInTheDocument();
        expect(screen.getByLabelText('Image thumbnails').className).toContain('w-fit');
        expect(screen.getByLabelText('Image thumbnails').className).toContain('overflow-x-auto');
        expect(document.querySelector('img[src="https://example.com/image-1.jpg"]')).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/image-1-thumb.jpg"]')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /next image/i }));
        expect(screen.getByRole('heading', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByText('2 / 10')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /previous image/i }));
        expect(screen.getByRole('heading', { name: 'Image 1' })).toBeInTheDocument();
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
            />
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
            />
        );

        expect(screen.getByRole('heading', { name: 'Image 5' })).toBeInTheDocument();
        expect(screen.getByText('5 / 10')).toBeInTheDocument();
    });
});
