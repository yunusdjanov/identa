'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type Konva from 'konva';
import type { Box as KonvaTransformerBox } from 'konva/lib/shapes/Transformer';
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from 'react-konva';
import { useI18n } from '@/components/providers/i18n-provider';
import { getApiErrorMessage } from '@/lib/api/client';
import { GalleryImageEditorControls } from './gallery-image-editor-controls';
import {
    createEditedImageFile,
    getSafeCropRectForRotation,
    isCropRectInsideRotatedImage,
    isPointInsideRotatedImage,
    loadEditableImage,
    normalizeRect,
    renderEditedCanvas,
} from './gallery-image-editor-canvas';
import {
    DEFAULT_BRIGHTNESS,
    DEFAULT_CONTRAST,
    DEFAULT_DRAW_COLOR,
    DEFAULT_DRAW_SIZE,
    DEFAULT_TEXT_SIZE,
    MAX_MANUAL_ROTATION_DEGREES,
    MAX_STRAIGHTEN_ROTATION_DEGREES,
    MIN_CROP_SIZE,
    MIN_MANUAL_ROTATION_DEGREES,
    MIN_STRAIGHTEN_ROTATION_DEGREES,
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
    value: string;
}

interface EditorViewportSize {
    width: number;
    height: number;
}

interface StageMetrics {
    width: number;
    height: number;
    scale: number;
}

type KonvaPointerEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>;

const DEFAULT_EDITOR_VIEWPORT: EditorViewportSize = { width: 760, height: 520 };
const MIN_STAGE_SIZE_PX = 220;
const STAGE_HORIZONTAL_PADDING_PX = 72;
const STAGE_VERTICAL_RESERVED_PX = 220;
const TOUCH_STAGE_HORIZONTAL_PADDING_PX = 24;
const TOUCH_STAGE_VERTICAL_RESERVED_PX = 260;
const CROP_ANCHORS = [
    'top-left',
    'top-center',
    'top-right',
    'middle-right',
    'bottom-right',
    'bottom-center',
    'bottom-left',
    'middle-left',
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isFinitePoint(point: Point | null): point is Point {
    return point !== null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function measureEditorViewport(): EditorViewportSize {
    if (typeof window === 'undefined') {
        return DEFAULT_EDITOR_VIEWPORT;
    }

    const isTouchWidth = window.innerWidth < 640;
    const horizontalPadding = isTouchWidth ? TOUCH_STAGE_HORIZONTAL_PADDING_PX : STAGE_HORIZONTAL_PADDING_PX;
    const verticalReserved = isTouchWidth ? TOUCH_STAGE_VERTICAL_RESERVED_PX : STAGE_VERTICAL_RESERVED_PX;

    return {
        width: Math.max(MIN_STAGE_SIZE_PX, window.innerWidth - horizontalPadding),
        height: Math.max(MIN_STAGE_SIZE_PX, window.innerHeight - verticalReserved),
    };
}

function stageCursorClass(mode: EditMode): string {
    if (mode === 'draw') {
        return 'cursor-crosshair';
    }

    if (mode === 'text') {
        return 'cursor-text';
    }

    if (mode === 'crop') {
        return 'cursor-crosshair';
    }

    return 'cursor-default';
}

function cropWithinVisibleRect(start: Point, end: Point, visibleRect: CropRect): CropRect {
    const localStart = {
        x: start.x - visibleRect.x,
        y: start.y - visibleRect.y,
    };
    const localEnd = {
        x: end.x - visibleRect.x,
        y: end.y - visibleRect.y,
    };
    const localRect = normalizeRect(localStart, localEnd, visibleRect.width, visibleRect.height);

    return {
        x: localRect.x + visibleRect.x,
        y: localRect.y + visibleRect.y,
        width: localRect.width,
        height: localRect.height,
    };
}

function cropRectsEqual(left: CropRect, right: CropRect): boolean {
    return (
        Math.abs(left.x - right.x) < 0.001
        && Math.abs(left.y - right.y) < 0.001
        && Math.abs(left.width - right.width) < 0.001
        && Math.abs(left.height - right.height) < 0.001
    );
}

function clampPointToRect(point: Point, rect: CropRect): Point {
    return {
        x: clamp(point.x, rect.x, rect.x + rect.width),
        y: clamp(point.y, rect.y, rect.y + rect.height),
    };
}

function clampCropRectToBounds(rect: CropRect, bounds: CropRect, minimumSize: number): CropRect {
    const safeBoundsWidth = Math.max(1, bounds.width);
    const safeBoundsHeight = Math.max(1, bounds.height);
    const safeMinimumSize = clamp(minimumSize, 1, Math.min(safeBoundsWidth, safeBoundsHeight));
    const width = clamp(rect.width, safeMinimumSize, safeBoundsWidth);
    const height = clamp(rect.height, safeMinimumSize, safeBoundsHeight);

    return {
        x: clamp(rect.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - width)),
        y: clamp(rect.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - height)),
        width,
        height,
    };
}

function normalizeRotationStep(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    const normalized = ((((Math.round(value) + 180) % 360) + 360) % 360) - 180;

    return normalized === MIN_MANUAL_ROTATION_DEGREES ? MAX_MANUAL_ROTATION_DEGREES : normalized;
}

/**
 * Keeps transformer crop boxes usable at image edges instead of rejecting the resize.
 */
export function clampCropTransformBox(
    box: CropRect,
    stageWidth: number,
    stageHeight: number,
    minimumSize: number
): CropRect {
    return clampCropTransformBoxToBounds(box, { x: 0, y: 0, width: stageWidth, height: stageHeight }, minimumSize);
}

/** Keeps transformer crop boxes inside the provided crop-safe boundary. */
export function clampCropTransformBoxToBounds(box: CropRect, bounds: CropRect, minimumSize: number): CropRect {
    const safeStageWidth = Math.max(1, bounds.width);
    const safeStageHeight = Math.max(1, bounds.height);
    const safeMinimumSize = clamp(minimumSize, 1, Math.min(safeStageWidth, safeStageHeight));
    const rawWidth = Number.isFinite(box.width) ? box.width : safeMinimumSize;
    const rawHeight = Number.isFinite(box.height) ? box.height : safeMinimumSize;
    const normalizedX = rawWidth < 0 ? box.x + rawWidth : box.x;
    const normalizedY = rawHeight < 0 ? box.y + rawHeight : box.y;
    const width = clamp(Math.abs(rawWidth), safeMinimumSize, safeStageWidth);
    const height = clamp(Math.abs(rawHeight), safeMinimumSize, safeStageHeight);

    return {
        x: clamp(
            Number.isFinite(normalizedX) ? normalizedX : bounds.x,
            bounds.x,
            Math.max(bounds.x, bounds.x + bounds.width - width)
        ),
        y: clamp(
            Number.isFinite(normalizedY) ? normalizedY : bounds.y,
            bounds.y,
            Math.max(bounds.y, bounds.y + bounds.height - height)
        ),
        width,
        height,
    };
}

function textStrokeColor(fillColor: string): string {
    return fillColor === '#ffffff' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.75)';
}

function isValidCropRect(rect: CropRect | null): rect is CropRect {
    return Boolean(rect && rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE);
}

function isEditableImageTarget(event: KonvaPointerEvent, stage: Konva.Stage | null): boolean {
    if (event.target === stage) {
        return true;
    }

    return event.target.name() === 'base-image';
}

/**
 * Clinical-photo editor for the fullscreen gallery.
 * Konva owns interactive editing, while the existing canvas exporter keeps the upload contract stable.
 */
export function GalleryImageEditor({ image, isSaving = false, onCancel, onSave }: GalleryImageEditorProps) {
    const { t } = useI18n();
    const stageRef = useRef<Konva.Stage | null>(null);
    const cropRectRef = useRef<Konva.Rect | null>(null);
    const cropTransformerRef = useRef<Konva.Transformer | null>(null);
    const activeStrokeRef = useRef<DrawStroke | null>(null);
    const cropStartRef = useRef<Point | null>(null);
    const saveInFlightRef = useRef(false);
    const textInputRef = useRef<HTMLInputElement | null>(null);
    const textDraftRef = useRef<InlineTextDraft | null>(null);
    const textDraftIdRef = useRef(0);
    const [viewportSize, setViewportSize] = useState<EditorViewportSize>(DEFAULT_EDITOR_VIEWPORT);
    const [source, setSource] = useState<HTMLImageElement | null>(null);
    const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
    const [mode, setMode] = useState<EditMode>('adjust');
    const [rotation, setRotation] = useState(0);
    const [straightenRotation, setStraightenRotation] = useState(0);
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
    const isEditingDisabled = isSaveBusy || !source || !previewCanvas;
    const effectiveRotation = useMemo(
        () => normalizeRotationStep(rotation + straightenRotation),
        [rotation, straightenRotation]
    );

    const visibleRect = useMemo<CropRect>(() => ({
        x: cropRect?.x ?? 0,
        y: cropRect?.y ?? 0,
        width: previewCanvas?.width ?? source?.naturalWidth ?? 1,
        height: previewCanvas?.height ?? source?.naturalHeight ?? 1,
    }), [cropRect?.x, cropRect?.y, previewCanvas?.height, previewCanvas?.width, source?.naturalHeight, source?.naturalWidth]);

    const fullSafeCropBounds = useMemo<CropRect>(() => {
        if (!source) {
            return visibleRect;
        }

        return getSafeCropRectForRotation(
            source.naturalWidth || source.width || 1,
            source.naturalHeight || source.height || 1,
            effectiveRotation
        );
    }, [effectiveRotation, source, visibleRect]);

    const stageMetrics = useMemo<StageMetrics>(() => {
        const scale = Math.min(
            viewportSize.width / Math.max(visibleRect.width, 1),
            viewportSize.height / Math.max(visibleRect.height, 1),
            1
        );

        return {
            scale,
            width: Math.max(1, Math.round(visibleRect.width * scale)),
            height: Math.max(1, Math.round(visibleRect.height * scale)),
        };
    }, [visibleRect.height, visibleRect.width, viewportSize.height, viewportSize.width]);

    const basePointToStagePoint = useCallback((point: Point): Point => ({
        x: (point.x - visibleRect.x) * stageMetrics.scale,
        y: (point.y - visibleRect.y) * stageMetrics.scale,
    }), [stageMetrics.scale, visibleRect.x, visibleRect.y]);

    const allStrokes = useMemo(() => (activeStroke ? [...strokes, activeStroke] : strokes), [activeStroke, strokes]);

    const stagePointToBasePoint = useCallback((point: Point): Point => ({
        x: point.x / Math.max(stageMetrics.scale, 0.001) + visibleRect.x,
        y: point.y / Math.max(stageMetrics.scale, 0.001) + visibleRect.y,
    }), [stageMetrics.scale, visibleRect.x, visibleRect.y]);

    const baseRectToStageRect = useCallback((rect: CropRect): CropRect => {
        const stagePoint = basePointToStagePoint(rect);

        return {
            x: stagePoint.x,
            y: stagePoint.y,
            width: rect.width * stageMetrics.scale,
            height: rect.height * stageMetrics.scale,
        };
    }, [basePointToStagePoint, stageMetrics.scale]);

    const stageRectToBaseRect = useCallback((rect: CropRect): CropRect => ({
        x: rect.x / Math.max(stageMetrics.scale, 0.001) + visibleRect.x,
        y: rect.y / Math.max(stageMetrics.scale, 0.001) + visibleRect.y,
        width: rect.width / Math.max(stageMetrics.scale, 0.001),
        height: rect.height / Math.max(stageMetrics.scale, 0.001),
    }), [stageMetrics.scale, visibleRect.x, visibleRect.y]);

    const sourceDimensions = useMemo(() => ({
        width: source?.naturalWidth || source?.width || 1,
        height: source?.naturalHeight || source?.height || 1,
    }), [source?.height, source?.naturalHeight, source?.naturalWidth, source?.width]);

    const isBasePointInsideImage = useCallback((point: Point): boolean => {
        if (!source) {
            return true;
        }

        return isPointInsideRotatedImage(sourceDimensions.width, sourceDimensions.height, effectiveRotation, point);
    }, [effectiveRotation, source, sourceDimensions.height, sourceDimensions.width]);

    const isBaseCropInsideImage = useCallback((rect: CropRect): boolean => {
        if (!source || rect.width < MIN_CROP_SIZE || rect.height < MIN_CROP_SIZE) {
            return true;
        }

        return isCropRectInsideRotatedImage(sourceDimensions.width, sourceDimensions.height, effectiveRotation, rect);
    }, [effectiveRotation, source, sourceDimensions.height, sourceDimensions.width]);

    const resolveBaseCropRect = useCallback((candidate: CropRect, fallback: CropRect): CropRect => {
        const clampedCandidate = clampCropRectToBounds(candidate, visibleRect, MIN_CROP_SIZE);
        if (isBaseCropInsideImage(clampedCandidate)) {
            return clampedCandidate;
        }

        const clampedFallback = clampCropRectToBounds(fallback, visibleRect, MIN_CROP_SIZE);
        if (isBaseCropInsideImage(clampedFallback)) {
            return clampedFallback;
        }

        return clampCropRectToBounds(fullSafeCropBounds, visibleRect, MIN_CROP_SIZE);
    }, [fullSafeCropBounds, isBaseCropInsideImage, visibleRect]);

    const stageCropBounds = useMemo<CropRect>(() => ({
        x: 0,
        y: 0,
        width: stageMetrics.width,
        height: stageMetrics.height,
    }), [stageMetrics.height, stageMetrics.width]);

    const resolveStageCropBox = useCallback((candidate: CropRect, fallback: CropRect): CropRect => {
        const minimumStageSize = MIN_CROP_SIZE * stageMetrics.scale;
        const nextStageRect = clampCropTransformBoxToBounds(candidate, stageCropBounds, minimumStageSize);
        if (isBaseCropInsideImage(stageRectToBaseRect(nextStageRect))) {
            return nextStageRect;
        }

        const fallbackStageRect = clampCropTransformBoxToBounds(fallback, stageCropBounds, minimumStageSize);
        if (isBaseCropInsideImage(stageRectToBaseRect(fallbackStageRect))) {
            return fallbackStageRect;
        }

        return baseRectToStageRect(resolveBaseCropRect(fullSafeCropBounds, visibleRect));
    }, [
        baseRectToStageRect,
        fullSafeCropBounds,
        isBaseCropInsideImage,
        resolveBaseCropRect,
        stageCropBounds,
        stageMetrics.scale,
        stageRectToBaseRect,
        visibleRect,
    ]);

    const pointerPosition = useCallback((): Point | null => {
        const position = stageRef.current?.getPointerPosition();
        if (!position) {
            return null;
        }

        return {
            x: clamp(position.x, 0, stageMetrics.width),
            y: clamp(position.y, 0, stageMetrics.height),
        };
    }, [stageMetrics.height, stageMetrics.width]);

    const screenSizeToBaseSize = useCallback((size: number): number => size / Math.max(stageMetrics.scale, 0.001), [stageMetrics.scale]);

    const buildTextAnnotation = useCallback((draft: InlineTextDraft): TextAnnotation | null => {
        const text = draft.value.trim();
        if (text === '') {
            return null;
        }

        return {
            ...draft.basePoint,
            text,
            color: drawColor,
            size: screenSizeToBaseSize(textSize),
        };
    }, [drawColor, screenSizeToBaseSize, textSize]);

    const commitTextDraft = useCallback(() => {
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
    }, [buildTextAnnotation, textDraft]);

    const cancelTextDraft = useCallback(() => {
        textDraftRef.current = null;
        setTextDraft(null);
    }, []);

    useEffect(() => {
        setViewportSize(measureEditorViewport());

        const handleResize = () => setViewportSize(measureEditorViewport());
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        textDraftRef.current = textDraft;
    }, [textDraft]);

    useEffect(() => {
        textInputRef.current?.focus();
    }, [textDraft?.id]);

    useEffect(() => {
        let isMounted = true;
        setSource(null);
        setPreviewCanvas(null);
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
        if (!source) {
            setPreviewCanvas(null);
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            renderEditedCanvas({
                canvas,
                source,
                rotation: effectiveRotation,
                brightness,
                contrast,
                cropRect,
                draftCropRect: null,
                strokes: [],
                textAnnotations: [],
                backgroundColor: null,
            });
            setPreviewCanvas(canvas);
        } catch {
            setPreviewCanvas(null);
            setError(t('gallery.edit.failed'));
        }
    }, [brightness, contrast, cropRect, effectiveRotation, source, t]);

    useEffect(() => {
        if (mode !== 'crop') {
            return;
        }

        setDraftCropRect((current) => {
            if (!current) {
                return current;
            }

            const nextRect = resolveBaseCropRect(current, current);

            return cropRectsEqual(current, nextRect) ? current : nextRect;
        });
    }, [
        mode,
        resolveBaseCropRect,
    ]);

    useEffect(() => {
        if (mode !== 'crop' || !draftCropRect || !cropRectRef.current || !cropTransformerRef.current) {
            cropTransformerRef.current?.nodes([]);
            return;
        }

        cropTransformerRef.current.nodes([cropRectRef.current]);
        cropTransformerRef.current.getLayer()?.batchDraw();
    }, [draftCropRect, mode, stageMetrics.height, stageMetrics.width]);

    const reset = () => {
        setRotation(0);
        setStraightenRotation(0);
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

    const updateCropFromNode = useCallback(() => {
        const node = cropRectRef.current;
        if (!node) {
            return;
        }

        const currentStageRect = {
            x: node.x(),
            y: node.y(),
            width: Math.max(MIN_CROP_SIZE * stageMetrics.scale, node.width() * node.scaleX()),
            height: Math.max(MIN_CROP_SIZE * stageMetrics.scale, node.height() * node.scaleY()),
        };
        const nextStageRect = resolveStageCropBox(currentStageRect, currentStageRect);

        node.x(nextStageRect.x);
        node.y(nextStageRect.y);
        node.width(nextStageRect.width);
        node.height(nextStageRect.height);
        node.scaleX(1);
        node.scaleY(1);
        setDraftCropRect(stageRectToBaseRect(nextStageRect));
    }, [resolveStageCropBox, stageMetrics.scale, stageRectToBaseRect]);

    const constrainCropDragPosition = useCallback((position: Point, currentStageRect: CropRect): Point => {
        const nextStageRect = resolveStageCropBox({
            x: position.x,
            y: position.y,
            width: currentStageRect.width,
            height: currentStageRect.height,
        }, currentStageRect);

        return { x: nextStageRect.x, y: nextStageRect.y };
    }, [resolveStageCropBox]);

    const constrainCropTransformBox = useCallback((oldBox: KonvaTransformerBox, newBox: KonvaTransformerBox): KonvaTransformerBox => {
        const nextStageRect = resolveStageCropBox(newBox, oldBox);

        return {
            ...newBox,
            ...nextStageRect,
        };
    }, [resolveStageCropBox]);

    const initializeStraightenCrop = useCallback((current: CropRect | null): CropRect => {
        const baseRect = current ?? fullSafeCropBounds;

        return resolveBaseCropRect(baseRect, fullSafeCropBounds);
    }, [fullSafeCropBounds, resolveBaseCropRect]);

    const clearDraftCrop = useCallback(() => {
        setDraftCropRect(null);
        cropStartRef.current = null;
    }, []);

    const rotateBy = useCallback((degrees: number) => {
        clearDraftCrop();
        setStraightenRotation(0);
        setRotation((value) => normalizeRotationStep(value + degrees));
    }, [clearDraftCrop]);

    const updateStraightenRotation = useCallback((value: number) => {
        const nextValue = clamp(
            Math.round(Number.isFinite(value) ? value : 0),
            MIN_STRAIGHTEN_ROTATION_DEGREES,
            MAX_STRAIGHTEN_ROTATION_DEGREES
        );

        cropStartRef.current = null;
        setStraightenRotation(nextValue);
        if (nextValue === 0) {
            return;
        }

        setDraftCropRect((current) => {
            const nextRect = initializeStraightenCrop(current);

            return current && cropRectsEqual(current, nextRect) ? current : nextRect;
        });
    }, [initializeStraightenCrop]);

    const startTextDraft = (basePoint: Point) => {
        commitTextDraft();
        textDraftIdRef.current += 1;
        const nextDraft = {
            id: textDraftIdRef.current,
            basePoint,
            value: '',
        };
        textDraftRef.current = nextDraft;
        setTextDraft(nextDraft);
    };

    const handleStagePointerDown = (event: KonvaPointerEvent) => {
        if (isEditingDisabled) {
            return;
        }

        const stagePoint = pointerPosition();
        if (!isFinitePoint(stagePoint)) {
            return;
        }
        const basePoint = stagePointToBasePoint(stagePoint);

        if (mode === 'crop') {
            if (!isEditableImageTarget(event, stageRef.current)) {
                return;
            }

            if (!isBasePointInsideImage(basePoint)) {
                return;
            }

            const cropStart = clampPointToRect(basePoint, visibleRect);
            cropStartRef.current = cropStart;
            setDraftCropRect({ x: cropStart.x, y: cropStart.y, width: 0, height: 0 });
            event.evt.preventDefault();
            return;
        }

        if (mode === 'draw') {
            const stroke = {
                points: [basePoint],
                color: drawColor,
                size: screenSizeToBaseSize(drawSize),
            };
            activeStrokeRef.current = stroke;
            setActiveStroke(stroke);
            event.evt.preventDefault();
            return;
        }

        if (mode === 'text') {
            startTextDraft(basePoint);
            event.evt.preventDefault();
        }
    };

    const handleStagePointerMove = (event: KonvaPointerEvent) => {
        if (isEditingDisabled) {
            return;
        }

        const stagePoint = pointerPosition();
        if (!isFinitePoint(stagePoint)) {
            return;
        }
        const basePoint = stagePointToBasePoint(stagePoint);

        if (mode === 'crop' && cropStartRef.current) {
            setDraftCropRect((current) => {
                const nextRect = cropWithinVisibleRect(cropStartRef.current as Point, basePoint, visibleRect);

                return resolveBaseCropRect(nextRect, current ?? fullSafeCropBounds);
            });
            event.evt.preventDefault();
            return;
        }

        if (mode === 'draw' && activeStrokeRef.current) {
            const nextStroke = {
                ...activeStrokeRef.current,
                points: [...activeStrokeRef.current.points, basePoint],
            };
            activeStrokeRef.current = nextStroke;
            setActiveStroke(nextStroke);
            event.evt.preventDefault();
        }
    };

    const handleStagePointerUp = () => {
        if (mode === 'draw' && activeStrokeRef.current) {
            const completedStroke = activeStrokeRef.current;
            setStrokes((current) => [...current, completedStroke]);
            activeStrokeRef.current = null;
            setActiveStroke(null);
        }

        cropStartRef.current = null;
    };

    const applyCrop = () => {
        if (!isValidCropRect(draftCropRect)) {
            return;
        }

        setCropRect(draftCropRect);
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
        if (!source || saveInFlightRef.current) {
            return;
        }

        saveInFlightRef.current = true;
        setError(null);
        setIsRendering(true);
        try {
            const pendingTextDraft = textDraftRef.current ?? textDraft;
            const pendingTextAnnotation = pendingTextDraft ? buildTextAnnotation(pendingTextDraft) : null;
            const committedTextAnnotations = pendingTextAnnotation
                ? [...textAnnotations, pendingTextAnnotation]
                : textAnnotations;
            const selectedCropRect = isValidCropRect(draftCropRect) ? draftCropRect : cropRect;
            const safeCropRect = selectedCropRect
                ? resolveBaseCropRect(selectedCropRect, fullSafeCropBounds)
                : null;
            const effectiveCropRect = safeCropRect ?? (
                straightenRotation === 0 ? null : clampCropRectToBounds(fullSafeCropBounds, fullSafeCropBounds, MIN_CROP_SIZE)
            );
            const file = await createEditedImageFile({
                source,
                image,
                rotation: effectiveRotation,
                brightness,
                contrast,
                cropRect: effectiveCropRect,
                strokes,
                textAnnotations: committedTextAnnotations,
            });
            if (pendingTextAnnotation) {
                setTextAnnotations(committedTextAnnotations);
                textDraftRef.current = null;
                setTextDraft(null);
            }
            await onSave(file);
        } catch (caughtError) {
            setError(getApiErrorMessage(caughtError, t('gallery.edit.failed')));
        } finally {
            saveInFlightRef.current = false;
            setIsRendering(false);
        }
    };

    const resetCrop = () => {
        setCropRect(null);
        setDraftCropRect(null);
        cropStartRef.current = null;
    };

    const changeMode = (nextMode: EditMode) => {
        if (mode === 'text' && nextMode !== 'text') {
            commitTextDraft();
        }
        setMode(nextMode);
        cropStartRef.current = null;
        if (nextMode !== 'crop') {
            setDraftCropRect(null);
        }
    };

    const stageCropRect = draftCropRect ? baseRectToStageRect(draftCropRect) : null;
    const inlineTextPoint = textDraft ? basePointToStagePoint(textDraft.basePoint) : null;
    const cursorClass = stageCursorClass(mode);

    return (
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-slate-950">
            <div className="flex min-h-0 items-center justify-center overflow-hidden px-3 py-3 sm:px-12 sm:py-6">
                <div className={`relative inline-flex max-h-full max-w-full touch-none rounded-md bg-slate-900 shadow-2xl shadow-black/40 ${cursorClass}`}>
                    <Stage
                        ref={stageRef}
                        data-testid="gallery-image-editor-stage"
                        width={stageMetrics.width}
                        height={stageMetrics.height}
                        onMouseDown={handleStagePointerDown}
                        onMouseMove={handleStagePointerMove}
                        onMouseUp={handleStagePointerUp}
                        onMouseLeave={handleStagePointerUp}
                        onTouchStart={handleStagePointerDown}
                        onTouchMove={handleStagePointerMove}
                        onTouchEnd={handleStagePointerUp}
                        aria-label={image.alt}
                    >
                        <Layer>
                            {previewCanvas ? (
                                <KonvaImage
                                    name="base-image"
                                    image={previewCanvas}
                                    width={stageMetrics.width}
                                    height={stageMetrics.height}
                                />
                            ) : null}
                            {allStrokes.map((stroke, index) => (
                                <Line
                                    key={`stroke-${index}`}
                                    points={stroke.points.flatMap((point) => {
                                        const stagePoint = basePointToStagePoint(point);
                                        return [stagePoint.x, stagePoint.y];
                                    })}
                                    stroke={stroke.color}
                                    strokeWidth={Math.max(1, stroke.size * stageMetrics.scale)}
                                    lineCap="round"
                                    lineJoin="round"
                                    tension={0.35}
                                    listening={false}
                                />
                            ))}
                            {textAnnotations.map((annotation, index) => {
                                const stagePoint = basePointToStagePoint(annotation);
                                const stageFontSize = Math.max(12, annotation.size * stageMetrics.scale);

                                return (
                                    <KonvaText
                                        key={`text-${index}`}
                                        x={stagePoint.x}
                                        y={stagePoint.y}
                                        text={annotation.text}
                                        fill={annotation.color}
                                        fontFamily="Arial, sans-serif"
                                        fontSize={stageFontSize}
                                        fontStyle="bold"
                                        stroke={textStrokeColor(annotation.color)}
                                        strokeWidth={Math.max(2, stageFontSize * 0.08)}
                                        listening={false}
                                    />
                                );
                            })}
                            {stageCropRect ? (
                                <>
                                    <Rect x={0} y={0} width={stageMetrics.width} height={stageCropRect.y} fill="rgba(2, 6, 23, 0.48)" listening={false} />
                                    <Rect x={0} y={stageCropRect.y + stageCropRect.height} width={stageMetrics.width} height={Math.max(0, stageMetrics.height - stageCropRect.y - stageCropRect.height)} fill="rgba(2, 6, 23, 0.48)" listening={false} />
                                    <Rect x={0} y={stageCropRect.y} width={stageCropRect.x} height={stageCropRect.height} fill="rgba(2, 6, 23, 0.48)" listening={false} />
                                    <Rect x={stageCropRect.x + stageCropRect.width} y={stageCropRect.y} width={Math.max(0, stageMetrics.width - stageCropRect.x - stageCropRect.width)} height={stageCropRect.height} fill="rgba(2, 6, 23, 0.48)" listening={false} />
                                    <Rect
                                        ref={cropRectRef}
                                        name="crop-rect"
                                        x={stageCropRect.x}
                                        y={stageCropRect.y}
                                        width={stageCropRect.width}
                                        height={stageCropRect.height}
                                        fill="rgba(45, 212, 191, 0.08)"
                                        stroke="#5eead4"
                                        strokeWidth={1.5}
                                        draggable={!isEditingDisabled}
                                        dragBoundFunc={(position) => constrainCropDragPosition(position, stageCropRect)}
                                        onMouseDown={(event) => {
                                            event.cancelBubble = true;
                                            cropStartRef.current = null;
                                        }}
                                        onTouchStart={(event) => {
                                            event.cancelBubble = true;
                                            cropStartRef.current = null;
                                        }}
                                        onDragMove={updateCropFromNode}
                                        onDragEnd={updateCropFromNode}
                                        onTransform={updateCropFromNode}
                                        onTransformEnd={updateCropFromNode}
                                    />
                                    <Transformer
                                        ref={cropTransformerRef}
                                        rotateEnabled={false}
                                        keepRatio={false}
                                        enabledAnchors={CROP_ANCHORS}
                                        anchorFill="#ccfbf1"
                                        anchorStroke="#0f766e"
                                        anchorSize={12}
                                        borderStroke="#5eead4"
                                        borderStrokeWidth={1.5}
                                        flipEnabled={false}
                                        boundBoxFunc={constrainCropTransformBox}
                                    />
                                </>
                            ) : null}
                        </Layer>
                    </Stage>
                    {textDraft && inlineTextPoint ? (
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
                            className="absolute z-20 h-10 min-w-40 max-w-[min(20rem,80vw)] rounded-lg border border-teal-300 bg-slate-950/90 px-3 text-sm font-semibold text-white shadow-xl shadow-black/30 outline-none ring-2 ring-teal-300/40 placeholder:text-white/45 disabled:opacity-70"
                            style={{
                                left: `${inlineTextPoint.x}px`,
                                top: `${inlineTextPoint.y}px`,
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
                onModeChange={changeMode}
                brightness={brightness}
                onBrightnessChange={setBrightness}
                contrast={contrast}
                onContrastChange={setContrast}
                straightenRotation={straightenRotation}
                onStraightenRotationChange={updateStraightenRotation}
                drawSize={drawSize}
                onDrawSizeChange={setDrawSize}
                textSize={textSize}
                onTextSizeChange={setTextSize}
                drawColor={drawColor}
                onDrawColorChange={setDrawColor}
                draftCropRect={draftCropRect}
                cropRect={cropRect}
                onApplyCrop={applyCrop}
                onResetCrop={resetCrop}
                canUndo={strokes.length > 0 || textAnnotations.length > 0}
                onUndo={undoAnnotation}
                onReset={reset}
                onCancel={onCancel}
                onSave={saveEditedImage}
                onRotateLeft={() => rotateBy(-ROTATION_STEP_DEGREES)}
                onRotateRight={() => rotateBy(ROTATION_STEP_DEGREES)}
                isEditingDisabled={isEditingDisabled}
                isSaveBusy={isSaveBusy}
            />
            {error ? <p className="mx-auto w-full max-w-6xl bg-slate-950 px-4 pb-3 text-xs font-medium text-red-200">{error}</p> : null}
        </div>
    );
}
