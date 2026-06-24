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
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('Image export failed.'));
        }, EXPORT_MIME_TYPE, EXPORT_QUALITY);
    });
}

function getRotatedSize(source: HTMLImageElement, rotation: number) {
    const normalizedRotation = normalizeRotation(rotation);
    const naturalWidth = source.naturalWidth || source.width;
    const naturalHeight = source.naturalHeight || source.height;
    const swapsDimensions = normalizedRotation === 90 || normalizedRotation === 270;

    return {
        width: swapsDimensions ? naturalHeight : naturalWidth,
        height: swapsDimensions ? naturalWidth : naturalHeight,
        naturalWidth,
        naturalHeight,
        normalizedRotation,
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

    if (normalizedRotation === 90) {
        context.translate(width, 0);
        context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
        context.translate(width, height);
        context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
        context.translate(0, height);
        context.rotate((Math.PI * 3) / 2);
    }

    context.drawImage(source, 0, 0, naturalWidth, naturalHeight);
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
        return;
    }

    let base: HTMLCanvasElement;
    try {
        base = drawRotatedBase(source, rotation, brightness, contrast);
    } catch {
        return;
    }
    const crop = cropRect ?? { x: 0, y: 0, width: base.width, height: base.height };
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));

    context = canvas.getContext('2d');
    if (!context) {
        return;
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

    const blob = await canvasToBlob(canvas);
    const baseName = sanitizeBaseName(image.title ?? image.alt);

    return new File([blob], `${baseName}-edited.jpg`, {
        type: EXPORT_MIME_TYPE,
        lastModified: Date.now(),
    });
}
