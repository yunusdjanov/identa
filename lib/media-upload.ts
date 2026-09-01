const SUPPORTED_IMAGE_UPLOAD_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

const SUPPORTED_IMAGE_UPLOAD_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function isSupportedImageUpload(file: Pick<File, 'name' | 'type'>): boolean {
    const mimeType = file.type.trim().toLowerCase();

    // A declared MIME type is authoritative on the client. Falling back to the
    // extension is only for browsers that leave File.type empty.
    if (mimeType !== '') {
        return SUPPORTED_IMAGE_UPLOAD_MIME_TYPES.has(mimeType);
    }

    const normalizedName = file.name.trim().toLowerCase();

    return SUPPORTED_IMAGE_UPLOAD_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}
