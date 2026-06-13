export const TOOTH_LAYOUT = {
    upperRight: [8, 7, 6, 5, 4, 3, 2, 1],
    upperLeft: [9, 10, 11, 12, 13, 14, 15, 16],
    lowerRight: [32, 31, 30, 29, 28, 27, 26, 25],
    lowerLeft: [17, 18, 19, 20, 21, 22, 23, 24],
} as const;

/**
 * Converts the app's stored adult-tooth index (1-32) to an FDI display label.
 */
export function toFdiToothNumber(toothNumber: number | null | undefined): number | null {
    if (typeof toothNumber !== 'number' || !Number.isFinite(toothNumber)) {
        return null;
    }

    const normalized = Math.trunc(toothNumber);
    if (normalized >= 1 && normalized <= 8) {
        return normalized + 10;
    }
    if (normalized >= 9 && normalized <= 16) {
        return normalized + 12;
    }
    if (normalized >= 17 && normalized <= 24) {
        return normalized + 14;
    }
    if (normalized >= 25 && normalized <= 32) {
        return normalized + 16;
    }

    return normalized;
}

/**
 * Formats a stored tooth number for UI labels without changing the persisted value.
 */
export function formatToothNumber(toothNumber: number | null | undefined): string {
    const fdiNumber = toFdiToothNumber(toothNumber);

    return fdiNumber === null ? '-' : String(fdiNumber);
}

/**
 * Formats a stored tooth-number list for history tables, exports, and tooltips.
 */
export function formatToothList(teeth: number[] | null | undefined): string {
    const labels = (teeth ?? [])
        .map((tooth) => formatToothNumber(tooth))
        .filter((label) => label !== '-');

    return labels.length > 0 ? labels.join(', ') : '-';
}
