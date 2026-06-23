'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '@/components/providers/i18n-provider';
import { GalleryImageEditorControls } from './gallery-image-editor-controls';
import { createEditedImageFile, loadEditableImage, normalizeRect, renderEditedCanvas } from './gallery-image-editor-canvas';
import {
    DEFAULT_BRIGHTNESS,
    DEFAULT_CONTRAST,
    DEFAULT_DRAW_COLOR,
    DEFAULT_DRAW_SIZE,
    DEFAULT_TEXT_SIZE,
    MIN_CROP_SIZE,
    ROTATION_STEP_DEGREES,
    type CropRect,
    type DrawStroke,
    type EditableGalleryImage,
    type EditMode,
    type Point,
    type TextAnnotation,
} from './gallery-image-editor-types';

interface GalleryImageEditorProps {
    image: EditableGalleryImage;
    isSaving?: boolean;
    onCancel: () => void;
    onSave: (file: File) => Promise<void> | void;
}

/**
 * Canvas-based clinical-photo editor used inside the fullscreen gallery.
 * Save exports a replacement image for the original media record.
 */
export function GalleryImageEditor({ image, isSaving = false, onCancel, onSave }: GalleryImageEditorProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cropStartRef = useRef<Point | null>(null);
    const activeStrokeRef = useRef<DrawStroke | null>(null);
    const [source, setSource] = useState<HTMLImageElement | null>(null);
    const [mode, setMode] = useState<EditMode>('adjust');
    const [rotation, setRotation] = useState(0);
    const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
    const [contrast, setContrast] = useState(DEFAULT_CONTRAST);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [draftCropRect, setDraftCropRect] = useState<CropRect | null>(null);
    const [strokes, setStrokes] = useState<DrawStroke[]>([]);
    const [activeStroke, setActiveStroke] = useState<DrawStroke | null>(null);
    const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
    const [drawColor, setDrawColor] = useState(DEFAULT_DRAW_COLOR);
    const [drawSize, setDrawSize] = useState(DEFAULT_DRAW_SIZE);
    const [textDraft, setTextDraft] = useState('');
    const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isSaveBusy = isSaving || isRendering;
    const isEditingDisabled = isSaveBusy || !source;
    const allStrokes = useMemo(() => (activeStroke ? [...strokes, activeStroke] : strokes), [activeStroke, strokes]);

    useEffect(() => {
        let isMounted = true;
        setSource(null);
        setError(null);

        loadEditableImage(image.src)
            .then((loadedImage) => {
                if (isMounted) {
                    setSource(loadedImage);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setError(t('gallery.edit.loadFailed'));
                }
            });

        return () => {
            isMounted = false;
        };
    }, [image.src, t]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !source) {
            return;
        }

        renderEditedCanvas({
            canvas,
            source,
            rotation,
            brightness,
            contrast,
            cropRect,
            draftCropRect,
            strokes: allStrokes,
            textAnnotations,
        });
    }, [allStrokes, brightness, contrast, cropRect, draftCropRect, rotation, source, textAnnotations]);

    const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();

        return {
            x: ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * canvas.width,
            y: ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * canvas.height,
        };
    };

    const toBasePoint = (point: Point): Point => ({
        x: point.x + (cropRect?.x ?? 0),
        y: point.y + (cropRect?.y ?? 0),
    });

    const reset = () => {
        setRotation(0);
        setBrightness(DEFAULT_BRIGHTNESS);
        setContrast(DEFAULT_CONTRAST);
        setCropRect(null);
        setDraftCropRect(null);
        setStrokes([]);
        setActiveStroke(null);
        setTextAnnotations([]);
        setError(null);
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (isEditingDisabled) {
            return;
        }

        const point = canvasPoint(event);
        event.currentTarget.setPointerCapture(event.pointerId);

        if (mode === 'crop') {
            cropStartRef.current = point;
            setDraftCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
            return;
        }

        if (mode === 'draw') {
            const stroke = { points: [toBasePoint(point)], color: drawColor, size: drawSize };
            activeStrokeRef.current = stroke;
            setActiveStroke(stroke);
            return;
        }

        if (mode === 'text' && textDraft.trim() !== '') {
            setTextAnnotations((current) => [
                ...current,
                { ...toBasePoint(point), text: textDraft.trim(), color: drawColor, size: textSize },
            ]);
            setTextDraft('');
        }
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (isEditingDisabled) {
            return;
        }

        const point = canvasPoint(event);
        const canvas = event.currentTarget;

        if (mode === 'crop' && cropStartRef.current) {
            setDraftCropRect(normalizeRect(cropStartRef.current, point, canvas.width, canvas.height));
            return;
        }

        if (mode === 'draw' && activeStrokeRef.current) {
            const nextStroke = {
                ...activeStrokeRef.current,
                points: [...activeStrokeRef.current.points, toBasePoint(point)],
            };
            activeStrokeRef.current = nextStroke;
            setActiveStroke(nextStroke);
        }
    };

    const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (mode === 'draw' && activeStrokeRef.current) {
            setStrokes((current) => [...current, activeStrokeRef.current as DrawStroke]);
            activeStrokeRef.current = null;
            setActiveStroke(null);
        }

        if (mode === 'crop') {
            cropStartRef.current = null;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const applyCrop = () => {
        if (!draftCropRect || draftCropRect.width < MIN_CROP_SIZE || draftCropRect.height < MIN_CROP_SIZE) {
            return;
        }

        setCropRect({
            x: draftCropRect.x + (cropRect?.x ?? 0),
            y: draftCropRect.y + (cropRect?.y ?? 0),
            width: draftCropRect.width,
            height: draftCropRect.height,
        });
        setDraftCropRect(null);
    };

    const undoAnnotation = () => {
        setError(null);
        if (mode === 'text' && textAnnotations.length > 0) {
            setTextAnnotations((current) => current.slice(0, -1));
            return;
        }

        if (strokes.length > 0) {
            setStrokes((current) => current.slice(0, -1));
        }
    };

    const saveEditedImage = async () => {
        if (!source) {
            return;
        }

        setError(null);
        setIsRendering(true);
        try {
            const file = await createEditedImageFile({ source, image, rotation, brightness, contrast, cropRect, strokes, textAnnotations });
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
                <canvas
                    ref={canvasRef}
                    className={`h-auto max-h-full w-auto max-w-full rounded-md bg-slate-100 object-contain shadow-2xl shadow-black/40 ${
                        mode === 'crop' || mode === 'draw' ? 'cursor-crosshair' : mode === 'text' ? 'cursor-text' : 'cursor-default'
                    }`}
                    aria-label={image.alt}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />
            </div>
            <GalleryImageEditorControls
                mode={mode}
                onModeChange={(nextMode) => {
                    setMode(nextMode);
                    setDraftCropRect(null);
                }}
                brightness={brightness}
                onBrightnessChange={setBrightness}
                contrast={contrast}
                onContrastChange={setContrast}
                drawSize={drawSize}
                onDrawSizeChange={setDrawSize}
                textSize={textSize}
                onTextSizeChange={setTextSize}
                drawColor={drawColor}
                onDrawColorChange={setDrawColor}
                draftCropRect={draftCropRect}
                cropRect={cropRect}
                onApplyCrop={applyCrop}
                onResetCrop={() => { setCropRect(null); setDraftCropRect(null); }}
                textDraft={textDraft}
                onTextDraftChange={setTextDraft}
                canUndo={strokes.length > 0 || textAnnotations.length > 0}
                onUndo={undoAnnotation}
                onReset={reset}
                onCancel={onCancel}
                onSave={saveEditedImage}
                onRotateLeft={() => setRotation((value) => value - ROTATION_STEP_DEGREES)}
                onRotateRight={() => setRotation((value) => value + ROTATION_STEP_DEGREES)}
                isEditingDisabled={isEditingDisabled}
                isSaveBusy={isSaveBusy}
            />
            {error ? <p className="mx-auto w-full max-w-6xl bg-slate-950 px-4 pb-3 text-xs font-medium text-red-200">{error}</p> : null}
        </div>
    );
}
