const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.82;
const SKIP_REENCODE_BELOW_BYTES = 1024 * 1024;

function buildOptimizedFileName(name: string, extension: string) {
    const baseName = name.replace(/\.[^.]+$/, '') || 'image';

    return `${baseName}.${extension}`;
}

function loadImageElement(sourceUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed.'));
        image.src = sourceUrl;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

export async function optimizeImageFileForUpload(
    file: File,
    {
        maxEdge = DEFAULT_MAX_EDGE,
        quality = DEFAULT_QUALITY,
    }: {
        maxEdge?: number;
        quality?: number;
    } = {}
): Promise<File> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return file;
    }

    if (!file.type.startsWith('image/')) {
        return file;
    }

    const sourceUrl = URL.createObjectURL(file);

    try {
        const image = await loadImageElement(sourceUrl);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const largestEdge = Math.max(sourceWidth, sourceHeight);
        const needsResize = largestEdge > maxEdge;

        if (!needsResize && file.size <= SKIP_REENCODE_BELOW_BYTES) {
            return file;
        }

        const scale = needsResize ? maxEdge / largestEdge : 1;
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const context = canvas.getContext('2d');
        if (!context) {
            return file;
        }

        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        const targetType = 'image/webp';
        const blob = await canvasToBlob(canvas, targetType, quality);
        if (!blob) {
            return file;
        }

        const shouldKeepOriginal = !needsResize && blob.size >= file.size * 0.94;
        if (shouldKeepOriginal) {
            return file;
        }

        return new File(
            [blob],
            buildOptimizedFileName(file.name, 'webp'),
            {
                type: targetType,
                lastModified: file.lastModified,
            }
        );
    } catch {
        return file;
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
}

export async function optimizeImageFilesForUpload(
    files: File[],
    {
        maxEdge = DEFAULT_MAX_EDGE,
        quality = DEFAULT_QUALITY,
        concurrency = 3,
    }: {
        maxEdge?: number;
        quality?: number;
        concurrency?: number;
    } = {}
): Promise<File[]> {
    if (files.length <= 1) {
        return Promise.all(files.map((file) => optimizeImageFileForUpload(file, { maxEdge, quality })));
    }

    const results = new Array<File>(files.length);
    const workerCount = Math.max(1, Math.min(concurrency, files.length));
    let currentIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
            const nextIndex = currentIndex;
            currentIndex += 1;

            if (nextIndex >= files.length) {
                return;
            }

            results[nextIndex] = await optimizeImageFileForUpload(files[nextIndex], {
                maxEdge,
                quality,
            });
        }
    }));

    return results;
}
