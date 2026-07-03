import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import {
    EXPORT_MIME_TYPE,
    EXPORT_QUALITY,
    MIN_CROP_SIZE,
    type CropRect,
    type DrawStroke,
    type EditableGalleryImage,
    type Point,
    type TextAnnotation,
} from './gallery-image-editor-types';

function sanitizeBaseName(value: string): string {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'edited-photo';
}

function normalizeRotation(rotation: number): number {
    return ((rotation % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isFinitePoint(point: Point | undefined): point is Point {
    return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Returns a drawable crop rectangle constrained to the current canvas bounds. */
export function clampCropRectToCanvas(cropRect: CropRect | null, width: number, height: number): CropRect {
    const canvasWidth = Math.max(1, width);
    const canvasHeight = Math.max(1, height);
    if (!cropRect || cropRect.width <= 0 || cropRect.height <= 0) {
        return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    }

    const left = clamp(cropRect.x, 0, Math.max(0, canvasWidth - 1));
    const top = clamp(cropRect.y, 0, Math.max(0, canvasHeight - 1));
    const right = clamp(cropRect.x + cropRect.width, left + 1, canvasWidth);
    const bottom = clamp(cropRect.y + cropRect.height, top + 1, canvasHeight);

    return {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
}

/** Builds a bounded crop rectangle from two canvas-space pointer positions. */
export function normalizeRect(start: Point, end: Point, width: number, height: number): CropRect {
    const left = clamp(Math.min(start.x, end.x), 0, width);
    const top = clamp(Math.min(start.y, end.y), 0, height);
    const right = clamp(Math.max(start.x, end.x), 0, width);
    const bottom = clamp(Math.max(start.y, end.y), 0, height);

    return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

/** Loads a protected media image with the same CORS behavior as the viewer. */
export function loadEditableImage(src: string): Promise<HTMLImageElement> {
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
        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error('Image export failed.'));
            }, EXPORT_MIME_TYPE, EXPORT_QUALITY);
        } catch (error) {
            reject(error instanceof Error ? error : new Error('Image export failed.'));
        }
    });
}

function getRotatedDimensions(rawWidth: number, rawHeight: number, rotation: number) {
    const normalizedRotation = normalizeRotation(rotation);
    const naturalWidth = Math.max(1, Math.round(rawWidth || 1));
    const naturalHeight = Math.max(1, Math.round(rawHeight || 1));
    if (normalizedRotation === 0 || normalizedRotation === 180) {
        return {
            width: naturalWidth,
            height: naturalHeight,
            naturalWidth,
            naturalHeight,
            normalizedRotation,
        };
    }

    if (normalizedRotation === 90 || normalizedRotation === 270) {
        return {
            width: naturalHeight,
            height: naturalWidth,
            naturalWidth,
            naturalHeight,
            normalizedRotation,
        };
    }

    const radians = (normalizedRotation * Math.PI) / 180;
    const width = Math.abs(naturalWidth * Math.cos(radians)) + Math.abs(naturalHeight * Math.sin(radians));
    const height = Math.abs(naturalWidth * Math.sin(radians)) + Math.abs(naturalHeight * Math.cos(radians));

    return {
        width: Math.max(1, Math.ceil(width)),
        height: Math.max(1, Math.ceil(height)),
        naturalWidth,
        naturalHeight,
        normalizedRotation,
    };
}

function getRotatedSize(source: HTMLImageElement, rotation: number) {
    return getRotatedDimensions(source.naturalWidth || source.width || 1, source.naturalHeight || source.height || 1, rotation);
}

/**
 * Returns the largest centered crop rectangle that stays fully inside a rotated image.
 */
export function getSafeCropRectForRotation(sourceWidth: number, sourceHeight: number, rotation: number): CropRect {
    const { width: canvasWidth, height: canvasHeight, naturalWidth, naturalHeight, normalizedRotation } = getRotatedDimensions(
        sourceWidth,
        sourceHeight,
        rotation
    );

    if (normalizedRotation % 90 === 0) {
        return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    }

    const angle = (normalizedRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.abs(Math.cos(angle));
    const epsilon = 0.000001;

    if (sin < epsilon || cos < epsilon) {
        return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    }

    const shortSide = Math.min(naturalWidth, naturalHeight);
    const longSide = Math.max(naturalWidth, naturalHeight);
    let safeWidth: number;
    let safeHeight: number;

    if (shortSide <= 2 * sin * cos * longSide) {
        const halfShortSide = shortSide / 2;
        if (naturalWidth >= naturalHeight) {
            safeWidth = halfShortSide / sin;
            safeHeight = halfShortSide / cos;
        } else {
            safeWidth = halfShortSide / cos;
            safeHeight = halfShortSide / sin;
        }
    } else {
        const cosDoubleAngle = cos * cos - sin * sin;
        safeWidth = (naturalWidth * cos - naturalHeight * sin) / cosDoubleAngle;
        safeHeight = (naturalHeight * cos - naturalWidth * sin) / cosDoubleAngle;
    }

    const width = clamp(Math.floor(Math.abs(safeWidth)), 1, canvasWidth);
    const height = clamp(Math.floor(Math.abs(safeHeight)), 1, canvasHeight);

    return {
        x: Math.max(0, Math.round((canvasWidth - width) / 2)),
        y: Math.max(0, Math.round((canvasHeight - height) / 2)),
        width,
        height,
    };
}

function drawRotatedBase(
    source: HTMLImageElement,
    rotation: number,
    brightness: number,
    contrast: number
): HTMLCanvasElement {
    const { width, height, naturalWidth, naturalHeight, normalizedRotation } = getRotatedSize(source, rotation);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas is unavailable.');
    }

    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    context.translate(width / 2, height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.drawImage(source, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight);
    context.restore();

    return canvas;
}

function drawAnnotations(
    context: CanvasRenderingContext2D,
    strokes: DrawStroke[],
    textAnnotations: TextAnnotation[]
) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    strokes.forEach((stroke) => {
        const points = stroke.points.filter(isFinitePoint);
        const strokeSize = Number.isFinite(stroke.size) ? Math.max(1, stroke.size) : 1;
        if (points.length === 0) {
            return;
        }

        context.beginPath();
        context.strokeStyle = stroke.color;
        context.lineWidth = strokeSize;
        context.moveTo(points[0].x, points[0].y);
        if (points.length === 1) {
            context.lineTo(points[0].x + 0.1, points[0].y + 0.1);
        } else {
            points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        }
        context.stroke();
    });

    textAnnotations.forEach((annotation) => {
        if (!isFinitePoint(annotation)) {
            return;
        }

        const annotationSize = Number.isFinite(annotation.size) ? Math.max(12, annotation.size) : 12;
        context.font = `600 ${annotationSize}px Arial, sans-serif`;
        context.fillStyle = annotation.color;
        context.textBaseline = 'top';
        context.lineJoin = 'round';
        context.strokeStyle = annotation.color === '#ffffff' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.75)';
        context.lineWidth = Math.max(3, annotationSize * 0.12);
        context.strokeText(annotation.text, annotation.x, annotation.y);
        context.fillText(annotation.text, annotation.x, annotation.y);
    });

    context.restore();
}

/** Renders the current editor state into a canvas preview or export surface. */
export function renderEditedCanvas({
    canvas,
    source,
    rotation,
    brightness,
    contrast,
    cropRect,
    draftCropRect,
    strokes,
    textAnnotations,
}: {
    canvas: HTMLCanvasElement;
    source: HTMLImageElement;
    rotation: number;
    brightness: number;
    contrast: number;
    cropRect: CropRect | null;
    draftCropRect?: CropRect | null;
    strokes: DrawStroke[];
    textAnnotations: TextAnnotation[];
}) {
    let context: CanvasRenderingContext2D | null = null;
    try {
        context = canvas.getContext('2d');
    } catch {
        context = null;
    }
    if (!context) {
        throw new Error('Canvas is unavailable.');
    }

    const base = drawRotatedBase(source, rotation, brightness, contrast);
    const crop = clampCropRectToCanvas(cropRect, base.width, base.height);
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));

    context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas is unavailable.');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(-crop.x, -crop.y);
    drawAnnotations(context, strokes, textAnnotations);
    context.restore();

    if (draftCropRect && draftCropRect.width >= MIN_CROP_SIZE && draftCropRect.height >= MIN_CROP_SIZE) {
        drawCropOverlay(context, canvas.width, canvas.height, draftCropRect);
    }
}

/** Draws crop selection chrome while keeping the selected image area visible. */
export function drawCropOverlay(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    crop: CropRect
) {
    const left = clamp(crop.x, 0, canvasWidth);
    const top = clamp(crop.y, 0, canvasHeight);
    const right = clamp(crop.x + crop.width, 0, canvasWidth);
    const bottom = clamp(crop.y + crop.height, 0, canvasHeight);

    context.save();
    context.fillStyle = 'rgba(2, 6, 23, 0.5)';
    context.fillRect(0, 0, canvasWidth, top);
    context.fillRect(0, bottom, canvasWidth, Math.max(0, canvasHeight - bottom));
    context.fillRect(0, top, left, Math.max(0, bottom - top));
    context.fillRect(right, top, Math.max(0, canvasWidth - right), Math.max(0, bottom - top));
    context.strokeStyle = '#2dd4bf';
    context.lineWidth = Math.max(2, canvasWidth * 0.002);
    context.strokeRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    context.restore();
}

/** Exports the edited state as a JPEG file suitable for replacement upload. */
export async function createEditedImageFile({
    source,
    image,
    rotation,
    brightness,
    contrast,
    cropRect,
    strokes,
    textAnnotations,
}: {
    source: HTMLImageElement;
    image: EditableGalleryImage;
    rotation: number;
    brightness: number;
    contrast: number;
    cropRect: CropRect | null;
    strokes: DrawStroke[];
    textAnnotations: TextAnnotation[];
}): Promise<File> {
    const canvas = document.createElement('canvas');
    renderEditedCanvas({
        canvas,
        source,
        rotation,
        brightness,
        contrast,
        cropRect,
        strokes,
        textAnnotations,
    });
    if (canvas.width < 1 || canvas.height < 1) {
        throw new Error('Image export failed.');
    }

    const blob = await canvasToBlob(canvas);
    const baseName = sanitizeBaseName(image.title ?? image.alt);

    return new File([blob], `${baseName}-edited.jpg`, {
        type: EXPORT_MIME_TYPE,
        lastModified: Date.now(),
    });
}
