'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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

interface InlineTextDraft {
    id: number;
    basePoint: Point;
    leftPercent: number;
    topPercent: number;
    value: string;
}

type CropHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type CropInteraction =
    | { type: 'create'; startPoint: Point }
    | { type: 'move'; startPoint: Point; originRect: CropRect }
    | { type: 'resize'; handle: CropHandle; originRect: CropRect };

const CROP_HANDLE_HIT_SIZE_PX = 14;

function isFinitePoint(point: Point): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function pointInRect(point: Point, rect: CropRect): boolean {
    return point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height;
}

function canvasUnitsForCssPixels(canvas: HTMLCanvasElement, cssPixels: number): number {
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(bounds.width, 1);
    const scaleY = canvas.height / Math.max(bounds.height, 1);

    return cssPixels * Math.max(scaleX, scaleY);
}

function cropHandleAtPoint(point: Point, rect: CropRect, hitRadius: number): CropHandle | null {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const nearLeft = Math.abs(point.x - left) <= hitRadius;
    const nearRight = Math.abs(point.x - right) <= hitRadius;
    const nearTop = Math.abs(point.y - top) <= hitRadius;
    const nearBottom = Math.abs(point.y - bottom) <= hitRadius;
    const withinX = point.x >= left - hitRadius && point.x <= right + hitRadius;
    const withinY = point.y >= top - hitRadius && point.y <= bottom + hitRadius;

    if (nearLeft && nearTop) return 'nw';
    if (nearRight && nearTop) return 'ne';
    if (nearLeft && nearBottom) return 'sw';
    if (nearRight && nearBottom) return 'se';
    if (nearTop && withinX) return 'n';
    if (nearBottom && withinX) return 's';
    if (nearLeft && withinY) return 'w';
    if (nearRight && withinY) return 'e';

    return null;
}

function moveCropRect(origin: CropRect, startPoint: Point, point: Point, canvasWidth: number, canvasHeight: number): CropRect {
    const nextX = clamp(origin.x + point.x - startPoint.x, 0, Math.max(0, canvasWidth - origin.width));
    const nextY = clamp(origin.y + point.y - startPoint.y, 0, Math.max(0, canvasHeight - origin.height));

    return { ...origin, x: nextX, y: nextY };
}

function resizeCropRect(origin: CropRect, handle: CropHandle, point: Point, canvasWidth: number, canvasHeight: number): CropRect {
    let left = origin.x;
    let right = origin.x + origin.width;
    let top = origin.y;
    let bottom = origin.y + origin.height;

    if (handle.includes('w')) left = clamp(point.x, 0, right - MIN_CROP_SIZE);
    if (handle.includes('e')) right = clamp(point.x, left + MIN_CROP_SIZE, canvasWidth);
    if (handle.includes('n')) top = clamp(point.y, 0, bottom - MIN_CROP_SIZE);
    if (handle.includes('s')) bottom = clamp(point.y, top + MIN_CROP_SIZE, canvasHeight);

    return {
        x: left,
        y: top,
        width: Math.max(MIN_CROP_SIZE, right - left),
        height: Math.max(MIN_CROP_SIZE, bottom - top),
    };
}

/**
 * Canvas-based clinical-photo editor used inside the fullscreen gallery.
 * Save exports a replacement image for the original media record.
 */
export function GalleryImageEditor({ image, isSaving = false, onCancel, onSave }: GalleryImageEditorProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cropInteractionRef = useRef<CropInteraction | null>(null);
    const activeStrokeRef = useRef<DrawStroke | null>(null);
    const textInputRef = useRef<HTMLInputElement | null>(null);
    const textDraftRef = useRef<InlineTextDraft | null>(null);
    const textDraftIdRef = useRef(0);
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
    const [textDraft, setTextDraft] = useState<InlineTextDraft | null>(null);
    const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isSaveBusy = isSaving || isRendering;
    const isEditingDisabled = isSaveBusy || !source;
    const allStrokes = useMemo(() => (activeStroke ? [...strokes, activeStroke] : strokes), [activeStroke, strokes]);

    useEffect(() => {
        textDraftRef.current = textDraft;
    }, [textDraft]);

    useEffect(() => {
        textInputRef.current?.focus();
    }, [textDraft?.id]);

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

        try {
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
        } catch {
            setError(t('gallery.edit.failed'));
        }
    }, [allStrokes, brightness, contrast, cropRect, draftCropRect, rotation, source, textAnnotations, t]);

    const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        const nativeEvent = event.nativeEvent;
        const offsetX = nativeEvent.offsetX;
        const offsetY = nativeEvent.offsetY;

        if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
            return {
                x: (offsetX / Math.max(bounds.width, 1)) * canvas.width,
                y: (offsetY / Math.max(bounds.height, 1)) * canvas.height,
            };
        }

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
        textDraftRef.current = null;
        setTextDraft(null);
        setError(null);
    };

    const buildTextAnnotation = (draft: InlineTextDraft): TextAnnotation | null => {
        const text = draft.value.trim();
        if (text === '') {
            return null;
        }

        return {
            ...draft.basePoint,
            text,
            color: drawColor,
            size: textSize,
        };
    };

    const commitTextDraft = () => {
        const currentDraft = textDraftRef.current ?? textDraft;
        if (!currentDraft) {
            return;
        }

        textDraftRef.current = null;
        const annotation = buildTextAnnotation(currentDraft);
        if (annotation) {
            setTextAnnotations((current) => [...current, annotation]);
        }
        setTextDraft(null);
    };

    const cancelTextDraft = () => {
        textDraftRef.current = null;
        setTextDraft(null);
    };

    const startTextDraft = (point: Point, canvas: HTMLCanvasElement) => {
        commitTextDraft();
        textDraftIdRef.current += 1;
        const nextDraft = {
            id: textDraftIdRef.current,
            basePoint: toBasePoint(point),
            leftPercent: (point.x / Math.max(canvas.width, 1)) * 100,
            topPercent: (point.y / Math.max(canvas.height, 1)) * 100,
            value: '',
        };
        textDraftRef.current = nextDraft;
        setTextDraft(nextDraft);
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (isEditingDisabled) {
            return;
        }

        const point = canvasPoint(event);
        if (!isFinitePoint(point)) {
            return;
        }

        if (mode === 'crop') {
            const currentDraft = draftCropRect && draftCropRect.width >= MIN_CROP_SIZE && draftCropRect.height >= MIN_CROP_SIZE
                ? draftCropRect
                : null;

            if (currentDraft) {
                const hitRadius = canvasUnitsForCssPixels(event.currentTarget, CROP_HANDLE_HIT_SIZE_PX);
                const handle = cropHandleAtPoint(point, currentDraft, hitRadius);
                if (handle) {
                    cropInteractionRef.current = { type: 'resize', handle, originRect: currentDraft };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    return;
                }

                if (pointInRect(point, currentDraft)) {
                    cropInteractionRef.current = { type: 'move', startPoint: point, originRect: currentDraft };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    return;
                }
            }

            cropInteractionRef.current = { type: 'create', startPoint: point };
            setDraftCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
        }

        if (mode === 'draw') {
            const stroke = { points: [toBasePoint(point)], color: drawColor, size: drawSize };
            activeStrokeRef.current = stroke;
            setActiveStroke(stroke);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
        }

        if (mode === 'text') {
            startTextDraft(point, event.currentTarget);
        }
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (isEditingDisabled) {
            return;
        }

        const point = canvasPoint(event);
        const canvas = event.currentTarget;
        if (!isFinitePoint(point)) {
            return;
        }

        if (mode === 'crop' && cropInteractionRef.current) {
            const interaction = cropInteractionRef.current;
            if (interaction.type === 'create') {
                setDraftCropRect(normalizeRect(interaction.startPoint, point, canvas.width, canvas.height));
            } else if (interaction.type === 'move') {
                setDraftCropRect(moveCropRect(interaction.originRect, interaction.startPoint, point, canvas.width, canvas.height));
            } else {
                setDraftCropRect(resizeCropRect(interaction.originRect, interaction.handle, point, canvas.width, canvas.height));
            }
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
            const completedStroke = activeStrokeRef.current;
            setStrokes((current) => [...current, completedStroke]);
            activeStrokeRef.current = null;
            setActiveStroke(null);
        }

        if (mode === 'crop') {
            cropInteractionRef.current = null;
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
            const pendingTextDraft = textDraftRef.current ?? textDraft;
            const pendingTextAnnotation = pendingTextDraft ? buildTextAnnotation(pendingTextDraft) : null;
            const committedTextAnnotations = pendingTextAnnotation
                ? [...textAnnotations, pendingTextAnnotation]
                : textAnnotations;
            const file = await createEditedImageFile({ source, image, rotation, brightness, contrast, cropRect, strokes, textAnnotations: committedTextAnnotations });
            if (pendingTextAnnotation) {
                setTextAnnotations(committedTextAnnotations);
                textDraftRef.current = null;
                setTextDraft(null);
            }
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
                <div className="relative inline-flex max-h-full max-w-full">
                    <canvas
                        ref={canvasRef}
                        className={`h-auto max-h-full w-auto max-w-full rounded-md bg-slate-900 object-contain shadow-2xl shadow-black/40 ${
                            mode === 'crop' || mode === 'draw' ? 'cursor-crosshair' : mode === 'text' ? 'cursor-text' : 'cursor-default'
                        }`}
                        aria-label={image.alt}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    />
                    {textDraft ? (
                        <input
                            ref={textInputRef}
                            value={textDraft.value}
                            onChange={(event) => {
                                const { value } = event.target;
                                setTextDraft((current) => {
                                    if (!current) {
                                        return current;
                                    }

                                    const nextDraft = { ...current, value };
                                    textDraftRef.current = nextDraft;

                                    return nextDraft;
                                });
                            }}
                            onBlur={commitTextDraft}
                            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitTextDraft();
                                } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelTextDraft();
                                }
                            }}
                            disabled={isSaveBusy}
                            placeholder={t('gallery.edit.textPlaceholder')}
                            aria-label={t('gallery.edit.text')}
                            className="absolute z-10 h-10 min-w-40 max-w-[min(20rem,80vw)] rounded-lg border border-teal-300 bg-slate-950/90 px-3 text-sm font-semibold text-white shadow-xl shadow-black/30 outline-none ring-2 ring-teal-300/40 placeholder:text-white/45 disabled:opacity-70"
                            style={{
                                left: `${textDraft.leftPercent}%`,
                                top: `${textDraft.topPercent}%`,
                                transform: 'translate(-0.25rem, -0.25rem)',
                                color: drawColor,
                                fontSize: `${Math.max(14, Math.min(textSize, 32))}px`,
                            }}
                        />
                    ) : null}
                </div>
            </div>
            <GalleryImageEditorControls
                mode={mode}
                onModeChange={(nextMode) => {
                    if (mode === 'text' && nextMode !== 'text') {
                        commitTextDraft();
                    }
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
