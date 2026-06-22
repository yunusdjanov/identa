'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { RotateCcw, RotateCw, Save } from 'lucide-react';
import { useI18n } from '@/components/providers/i18n-provider';

interface EditableGalleryImage {
    src: string;
    alt: string;
    title?: string;
}

interface GalleryImageEditorProps {
    image: EditableGalleryImage;
    isSaving?: boolean;
    onCancel: () => void;
    onSave: (file: File) => Promise<void> | void;
}

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_CONTRAST = 100;
const MIN_ADJUSTMENT_PERCENT = 60;
const MAX_ADJUSTMENT_PERCENT = 140;
const ADJUSTMENT_STEP_PERCENT = 5;
const ROTATION_STEP_DEGREES = 90;
const EXPORT_MIME_TYPE = 'image/jpeg';
const EXPORT_QUALITY = 0.92;

function sanitizeBaseName(value: string): string {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'edited-photo';
}

function loadEditableImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const crossOrigin = getProtectedMediaCrossOrigin(src);
        if (crossOrigin) {
            image.crossOrigin = crossOrigin;
        }
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed.'));
        image.src = src;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('Image export failed.'));
        }, EXPORT_MIME_TYPE, EXPORT_QUALITY);
    });
}

async function createEditedImageFile({
    image,
    rotation,
    brightness,
    contrast,
}: {
    image: EditableGalleryImage;
    rotation: number;
    brightness: number;
    contrast: number;
}): Promise<File> {
    const source = await loadEditableImage(image.src);
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const naturalWidth = source.naturalWidth || source.width;
    const naturalHeight = source.naturalHeight || source.height;
    const swapsDimensions = normalizedRotation === 90 || normalizedRotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swapsDimensions ? naturalHeight : naturalWidth;
    canvas.height = swapsDimensions ? naturalWidth : naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas is unavailable.');
    }

    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    if (normalizedRotation === 90) {
        context.translate(canvas.width, 0);
        context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
        context.translate(canvas.width, canvas.height);
        context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
        context.translate(0, canvas.height);
        context.rotate((Math.PI * 3) / 2);
    }

    context.drawImage(source, 0, 0, naturalWidth, naturalHeight);
    context.restore();

    const blob = await canvasToBlob(canvas);
    const baseName = sanitizeBaseName(image.title ?? image.alt);

    return new File([blob], `${baseName}-edited.jpg`, {
        type: EXPORT_MIME_TYPE,
        lastModified: Date.now(),
    });
}

/**
 * Lightweight clinical-photo editor used inside the fullscreen gallery.
 * It exports a new image file and leaves the original media untouched.
 */
export function GalleryImageEditor({
    image,
    isSaving = false,
    onCancel,
    onSave,
}: GalleryImageEditorProps) {
    const { t } = useI18n();
    const [rotation, setRotation] = useState(0);
    const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
    const [contrast, setContrast] = useState(DEFAULT_CONTRAST);
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isBusy = isSaving || isRendering;
    const imageStyle = useMemo(
        () => ({
            transform: `rotate(${rotation}deg)`,
            filter: `brightness(${brightness}%) contrast(${contrast}%)`,
        }),
        [brightness, contrast, rotation]
    );

    const reset = () => {
        setRotation(0);
        setBrightness(DEFAULT_BRIGHTNESS);
        setContrast(DEFAULT_CONTRAST);
        setError(null);
    };

    const handleSave = async () => {
        setError(null);
        setIsRendering(true);
        try {
            const file = await createEditedImageFile({
                image,
                rotation,
                brightness,
                contrast,
            });
            await onSave(file);
        } catch {
            setError(t('gallery.edit.failed'));
        } finally {
            setIsRendering(false);
        }
    };

    return (
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-slate-950">
            <div className="flex min-h-0 items-center justify-center overflow-hidden px-3 py-3 sm:px-16 sm:py-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    key={image.src}
                    src={image.src}
                    alt={image.alt}
                    crossOrigin={getProtectedMediaCrossOrigin(image.src)}
                    className="h-auto max-h-full w-auto max-w-full rounded-md object-contain shadow-2xl shadow-black/40 transition duration-150"
                    style={imageStyle}
                    decoding="async"
                />
            </div>
            <div className="border-t border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.brightness')}: {brightness}%
                            </Label>
                            <input
                                type="range"
                                value={brightness}
                                min={MIN_ADJUSTMENT_PERCENT}
                                max={MAX_ADJUSTMENT_PERCENT}
                                step={ADJUSTMENT_STEP_PERCENT}
                                onChange={(event) => setBrightness(Number(event.target.value))}
                                disabled={isBusy}
                                className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.contrast')}: {contrast}%
                            </Label>
                            <input
                                type="range"
                                value={contrast}
                                min={MIN_ADJUSTMENT_PERCENT}
                                max={MAX_ADJUSTMENT_PERCENT}
                                step={ADJUSTMENT_STEP_PERCENT}
                                onChange={(event) => setContrast(Number(event.target.value))}
                                disabled={isBusy}
                                className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                            onClick={() => setRotation((value) => value - ROTATION_STEP_DEGREES)}
                            disabled={isBusy}
                        >
                            <RotateCcw className="mr-1.5 h-4 w-4" />
                            {t('gallery.edit.rotateLeft')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                            onClick={() => setRotation((value) => value + ROTATION_STEP_DEGREES)}
                            disabled={isBusy}
                        >
                            <RotateCw className="mr-1.5 h-4 w-4" />
                            {t('gallery.edit.rotateRight')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-white/75 hover:bg-white/10 hover:text-white"
                            onClick={reset}
                            disabled={isBusy}
                        >
                            {t('gallery.edit.reset')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-white/75 hover:bg-white/10 hover:text-white"
                            onClick={onCancel}
                            disabled={isBusy}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-teal-500 text-slate-950 hover:bg-teal-400"
                            onClick={handleSave}
                            disabled={isBusy}
                        >
                            <Save className="mr-1.5 h-4 w-4" />
                            {isBusy ? t('gallery.edit.saving') : t('gallery.edit.saveCopy')}
                        </Button>
                    </div>
                </div>
                {error ? (
                    <p className="mx-auto mt-2 max-w-5xl text-xs font-medium text-red-200">
                        {error}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
