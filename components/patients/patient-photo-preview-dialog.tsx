'use client';

import { useMemo, useState } from 'react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

export interface PreviewGalleryImage {
    src: string;
    alt: string;
    title?: string;
    thumbnailSrc?: string;
}

interface PatientPhotoPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    src?: string | null;
    alt: string;
    title: string;
    images?: PreviewGalleryImage[];
    startIndex?: number;
}

export function PatientPhotoPreviewDialog({
    open,
    onOpenChange,
    src,
    alt,
    title,
    images,
    startIndex = 0,
}: PatientPhotoPreviewDialogProps) {
    const resolvedImages = useMemo<PreviewGalleryImage[]>(() => {
        if (images && images.length > 0) {
            return images.filter((image) => Boolean(image?.src));
        }
        if (src) {
            return [{ src, alt, title }];
        }
        return [];
    }, [images, src, alt, title]);

    const gallerySignature = useMemo(
        () => `${startIndex}:${resolvedImages.map((image) => image.src).join('|')}`,
        [resolvedImages, startIndex]
    );
    const [selectedImage, setSelectedImage] = useState({ signature: '', index: 0 });
    const clampedStartIndex = resolvedImages.length > 0
        ? Math.min(Math.max(startIndex, 0), resolvedImages.length - 1)
        : 0;
    const currentIndex = selectedImage.signature === gallerySignature
        ? Math.min(Math.max(selectedImage.index, 0), Math.max(resolvedImages.length - 1, 0))
        : clampedStartIndex;
    const activeImage = resolvedImages[currentIndex];
    const canNavigate = resolvedImages.length > 1;

    const updateCurrentIndex = (getNextIndex: number | ((currentIndex: number) => number)) => {
        if (resolvedImages.length === 0) {
            return;
        }

        const nextIndex = typeof getNextIndex === 'function'
            ? getNextIndex(currentIndex)
            : getNextIndex;

        setSelectedImage({
            signature: gallerySignature,
            index: Math.min(Math.max(nextIndex, 0), resolvedImages.length - 1),
        });
    };

    const goToPrevious = () => {
        if (!canNavigate) {
            return;
        }
        updateCurrentIndex((current) => (current === 0 ? resolvedImages.length - 1 : current - 1));
    };

    const goToNext = () => {
        if (!canNavigate) {
            return;
        }
        updateCurrentIndex((current) => (current === resolvedImages.length - 1 ? 0 : current + 1));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="grid h-[min(88vh,720px)] max-h-[88vh] w-[min(92vw,920px)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl sm:max-w-[920px]"
            >
                <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900">
                        {activeImage?.title ?? title}
                    </DialogTitle>
                    <DialogClose className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </div>
                <DialogDescription className="sr-only">
                    {title}
                </DialogDescription>
                {activeImage ? (
                    <div className="flex min-h-0 flex-col px-5 py-4">
                        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-3">
                            {canNavigate ? (
                                <>
                                    <button
                                        type="button"
                                        className="absolute left-4 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900"
                                        onClick={goToPrevious}
                                        aria-label="Previous image"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        className="absolute right-4 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900"
                                        onClick={goToNext}
                                        aria-label="Next image"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </>
                            ) : null}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={activeImage.src}
                                alt={activeImage.alt}
                                crossOrigin={getProtectedMediaCrossOrigin(activeImage.src)}
                                className="h-auto max-h-full w-auto max-w-full rounded-lg object-contain"
                                decoding="async"
                                fetchPriority="high"
                            />
                        </div>
                        {canNavigate ? (
                            <div className="mt-3 min-w-0 shrink-0 space-y-2">
                                <p className="text-center text-xs font-medium text-slate-500">
                                    {currentIndex + 1} / {resolvedImages.length}
                                </p>
                                <div className="flex max-w-full justify-center overflow-hidden">
                                    <div
                                        className="flex w-fit max-w-full items-center justify-start gap-2 overflow-x-auto px-1 pb-1"
                                        aria-label="Image thumbnails"
                                    >
                                        {resolvedImages.map((image, index) => (
                                            <button
                                                key={`${image.src}-${index}`}
                                                type="button"
                                                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-colors ${
                                                    index === currentIndex
                                                        ? 'border-blue-300 ring-1 ring-blue-100'
                                                        : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                                onClick={() => updateCurrentIndex(index)}
                                                title={image.title ?? `${title} ${index + 1}`}
                                            >
                                                {image.thumbnailSrc ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={image.thumbnailSrc}
                                                        alt={image.alt}
                                                        crossOrigin={getProtectedMediaCrossOrigin(image.thumbnailSrc)}
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                ) : (
                                                    <span className="inline-flex h-full w-full items-center justify-center bg-slate-50 text-slate-400">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
