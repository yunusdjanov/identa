'use client';

import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { useI18n } from '@/components/providers/i18n-provider';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';

export interface PreviewGalleryImage {
    src: string;
    alt: string;
    title?: string;
    thumbnailSrc?: string;
}

function buildDownloadFileName(image: PreviewGalleryImage, mimeType: string): string {
    const base = (image.title ?? image.alt ?? 'photo')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '-') || 'photo';
    const ext = mimeType === 'image/png' ? 'png'
        : mimeType === 'image/webp' ? 'webp'
        : mimeType === 'image/svg+xml' ? 'svg'
        : mimeType === 'image/gif' ? 'gif'
        : 'jpg';
    return `${base}.${ext}`;
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
    const { t } = useI18n();
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

    // Arrow-key navigation, like any standard image viewer (Esc is handled by the Dialog).
    useEffect(() => {
        if (!open || !canNavigate) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goToPrevious();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                goToNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, canNavigate, currentIndex, gallerySignature]);

    const handleDownload = async () => {
        if (!activeImage) {
            return;
        }

        const openInNewTab = () => window.open(activeImage.src, '_blank', 'noopener,noreferrer');
        try {
            const response = await fetch(activeImage.src);
            if (!response.ok) {
                openInNewTab();
                return;
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = buildDownloadFileName(activeImage, blob.type);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
        } catch {
            // Cross-origin without CORS (or offline): fall back to opening the image.
            openInNewTab();
        }
    };

    // Touch swipe to change images on mobile.
    const touchStartXRef = useRef<number | null>(null);
    const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
    };
    const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
        if (touchStartXRef.current === null) {
            return;
        }
        const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const deltaX = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(deltaX) < 40) {
            return;
        }
        if (deltaX < 0) {
            goToNext();
        } else {
            goToPrevious();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="grid h-[min(88dvh,720px)] max-h-[calc(100dvh-1.5rem)] w-[min(94vw,920px)] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-0 text-slate-900 shadow-2xl shadow-slate-900/15 sm:max-w-[920px]"
            >
                <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
                    <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-slate-900">
                        {activeImage?.title ?? title}
                    </DialogTitle>
                    {activeImage ? (
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-xs transition hover:-translate-y-0.5 hover:border-teal-100 hover:bg-teal-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100"
                            aria-label={t('gallery.download')}
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    ) : null}
                    <DialogClose className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-xs transition hover:-translate-y-0.5 hover:border-teal-100 hover:bg-teal-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100">
                        <X className="h-4 w-4" />
                        <span className="sr-only">{t('common.close')}</span>
                    </DialogClose>
                </div>
                <DialogDescription className="sr-only">
                    {title}
                </DialogDescription>
                {activeImage ? (
                    <div className="flex min-h-0 flex-col gap-3 px-5 py-4">
                        <div
                            className="relative flex min-h-0 min-w-0 flex-1 touch-pan-y items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80 p-3 sm:p-4"
                            onTouchStart={canNavigate ? handleTouchStart : undefined}
                            onTouchEnd={canNavigate ? handleTouchEnd : undefined}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                key={currentIndex}
                                src={activeImage.src}
                                alt={activeImage.alt}
                                crossOrigin={getProtectedMediaCrossOrigin(activeImage.src)}
                                className="h-auto max-h-full w-auto max-w-full rounded-lg object-contain shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                                decoding="async"
                                fetchPriority="high"
                            />
                            {canNavigate ? (
                                <>
                                    <button
                                        type="button"
                                        className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:scale-105 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                                        onClick={goToPrevious}
                                        aria-label={t('gallery.previous')}
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:scale-105 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                                        onClick={goToNext}
                                        aria-label={t('gallery.next')}
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                    <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur">
                                        {currentIndex + 1} / {resolvedImages.length}
                                    </span>
                                </>
                            ) : null}
                        </div>
                        {canNavigate ? (
                            <div className="flex max-w-full shrink-0 justify-center overflow-hidden">
                                <div
                                    className="flex w-fit max-w-full items-center justify-start gap-2 overflow-x-auto px-1 pb-1"
                                    aria-label={t('gallery.thumbnails')}
                                >
                                    {resolvedImages.map((image, index) => {
                                        const thumbnailDisplaySrc = image.thumbnailSrc ?? image.src;

                                        return (
                                        <button
                                            key={`${image.src}-${index}`}
                                            type="button"
                                            aria-current={index === currentIndex}
                                            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white shadow-xs transition-all ${
                                                index === currentIndex
                                                    ? 'border-teal-300 ring-2 ring-teal-200'
                                                    : 'border-slate-200 opacity-65 hover:opacity-100 hover:border-slate-300'
                                            }`}
                                            onClick={() => updateCurrentIndex(index)}
                                            title={image.title ?? `${title} ${index + 1}`}
                                        >
                                            {thumbnailDisplaySrc ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={thumbnailDisplaySrc}
                                                    alt={image.alt}
                                                    crossOrigin={getProtectedMediaCrossOrigin(thumbnailDisplaySrc)}
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
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
