export interface EditableGalleryImage {
    src: string;
    alt: string;
    title?: string;
}

export type EditMode = 'adjust' | 'crop' | 'draw' | 'text';

export interface Point {
    x: number;
    y: number;
}

export interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DrawStroke {
    points: Point[];
    color: string;
    size: number;
}

export interface TextAnnotation {
    x: number;
    y: number;
    text: string;
    color: string;
    size: number;
}

export const DEFAULT_BRIGHTNESS = 100;
export const DEFAULT_CONTRAST = 100;
export const MIN_ADJUSTMENT_PERCENT = 60;
export const MAX_ADJUSTMENT_PERCENT = 140;
export const ADJUSTMENT_STEP_PERCENT = 5;
export const ROTATION_STEP_DEGREES = 90;
export const MIN_MANUAL_ROTATION_DEGREES = -180;
export const MAX_MANUAL_ROTATION_DEGREES = 180;
export const MANUAL_ROTATION_STEP_DEGREES = 1;
export const MIN_STRAIGHTEN_ROTATION_DEGREES = -45;
export const MAX_STRAIGHTEN_ROTATION_DEGREES = 45;
export const STRAIGHTEN_ROTATION_STEP_DEGREES = 1;
export const EXPORT_MIME_TYPE = 'image/jpeg';
export const EXPORT_QUALITY = 0.92;
export const MIN_CROP_SIZE = 16;
export const DEFAULT_DRAW_COLOR = '#14b8a6';
export const DEFAULT_DRAW_SIZE = 5;
export const DEFAULT_TEXT_SIZE = 32;
export const COLOR_SWATCHES = ['#14b8a6', '#ef4444', '#f59e0b', '#ffffff', '#0f172a'];
