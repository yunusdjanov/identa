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
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X } from 'lucide-react';

export interface PreviewGalleryImage {
    id?: string;
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
    onDeleteImage?: (image: PreviewGalleryImage) => void;
    isDeletePending?: boolean;
}

export function PatientPhotoPreviewDialog({
    open,
    onOpenChange,
    src,
    alt,
    title,
    images,
    startIndex = 0,
    onDeleteImage,
    isDeletePending = false,
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
                className="!fixed !inset-0 !left-0 !top-0 grid !h-[100dvh] !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden !rounded-none !border-0 bg-slate-950 p-0 text-white !shadow-none sm:!max-w-none"
            >
                <div className="z-20 flex min-w-0 items-center gap-2 border-b border-white/10 bg-slate-950/90 px-3 py-3 backdrop-blur sm:px-5">
                    <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold tracking-normal text-white sm:text-base">
                        {activeImage?.title ?? title}
                    </DialogTitle>
                    {activeImage ? (
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 shadow-sm backdrop-blur transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                            aria-label={t('gallery.download')}
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    ) : null}
                    {activeImage && onDeleteImage ? (
                        <button
                            type="button"
                            onClick={() => onDeleteImage(activeImage)}
                            disabled={isDeletePending}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-200 shadow-sm backdrop-blur transition hover:bg-red-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={t('common.delete')}
                        >
                            {isDeletePending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                        </button>
                    ) : null}
                    <DialogClose className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 shadow-sm backdrop-blur transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
                        <X className="h-4 w-4" />
                        <span className="sr-only">{t('common.close')}</span>
                    </DialogClose>
                </div>
                <DialogDescription className="sr-only">
                    {title}
                </DialogDescription>
                {activeImage ? (
                    <>
                        <div
                            className="relative flex min-h-0 min-w-0 touch-pan-y select-none items-center justify-center overflow-hidden bg-slate-950 px-3 py-3 sm:px-16 sm:py-6"
                            onTouchStart={canNavigate ? handleTouchStart : undefined}
                            onTouchEnd={canNavigate ? handleTouchEnd : undefined}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                key={currentIndex}
                                src={activeImage.src}
                                alt={activeImage.alt}
                                crossOrigin={getProtectedMediaCrossOrigin(activeImage.src)}
                                className="h-auto max-h-full w-auto max-w-full rounded-md object-contain shadow-2xl shadow-black/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                                decoding="async"
                                fetchPriority="high"
                            />
                            {canNavigate ? (
                                <>
                                    <button
                                        type="button"
                                        className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 shadow-lg backdrop-blur transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:left-5"
                                        onClick={goToPrevious}
                                        aria-label={t('gallery.previous')}
                                    >
                                        <ChevronLeft className="h-6 w-6" />
                                    </button>
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/80 shadow-lg backdrop-blur transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:right-5"
                                        onClick={goToNext}
                                        aria-label={t('gallery.next')}
                                    >
                                        <ChevronRight className="h-6 w-6" />
                                    </button>
                                    <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur">
                                        {currentIndex + 1} / {resolvedImages.length}
                                    </span>
                                </>
                            ) : null}
                        </div>
                        {canNavigate ? (
                            <div className="z-20 flex max-w-full shrink-0 justify-center overflow-hidden border-t border-white/10 bg-slate-950/90 px-3 py-3 backdrop-blur">
                                <div
                                    className="flex w-fit max-w-full items-center justify-start gap-2 overflow-x-auto px-1 py-1"
                                    aria-label={t('gallery.thumbnails')}
                                >
                                    {resolvedImages.map((image, index) => {
                                        const thumbnailDisplaySrc = image.thumbnailSrc ?? image.src;

                                        return (
                                        <button
                                            key={`${image.src}-${index}`}
                                            type="button"
                                            aria-current={index === currentIndex}
                                            className={`inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white/5 shadow-sm transition-all ${
                                                index === currentIndex
                                                    ? 'border-teal-300 opacity-100 ring-2 ring-teal-300'
                                                    : 'border-white/15 opacity-55 hover:border-white/40 hover:opacity-100'
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
                                                <span className="inline-flex h-full w-full items-center justify-center bg-white/5 text-white/50">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />
                                                </span>
                                            )}
                                        </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
