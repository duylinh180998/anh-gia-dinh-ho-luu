/** Gallery thumb — enough for ~2x retina column (~400px). */
export const THUMB_MAX_EDGE = 800;
export const THUMB_QUALITY = 0.72;

/** Lightbox / “full” — sharp on large screens, far smaller than phone originals. */
export const FULL_MAX_EDGE = 2560;
export const FULL_QUALITY = 0.82;

/**
 * Map full object key → thumbnail key.
 * e.g. "2026/photo.webp" → "thumbs/2026/photo.webp"
 * Separate prefix so ListObjects under "2026/" never includes thumbs.
 */
export function toThumbKey(fullKey) {
    const stem = fullKey.replace(/\.[^.]+$/, '');
    return `thumbs/${stem}.webp`;
}

/** Stem used to match full ↔ thumb, e.g. "2026/photo.jpg" → "2026/photo" */
export function toImageStem(fullKey) {
    return fullKey.replace(/\.[^.]+$/, '');
}

/** Parse stem from a thumb key: "thumbs/2026/photo.webp" → "2026/photo" */
export function stemFromThumbKey(thumbKey) {
    return thumbKey.replace(/^thumbs\//, '').replace(/\.webp$/i, '');
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to decode image'));
        };
        img.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
    });
}

/**
 * Draw image onto a canvas capped at maxEdge (long side).
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number, outW: number, outH: number }}
 */
function drawScaled(img, maxEdge) {
    const width = img.naturalWidth || 4;
    const height = img.naturalHeight || 3;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, 0, 0, outW, outH);
    return { canvas, width, height, outW, outH };
}

async function encodeWebpOrJpeg(canvas, quality) {
    const webp = await canvasToBlob(canvas, 'image/webp', quality);
    if (webp && webp.size > 0) {
        return { blob: webp, contentType: 'image/webp', ext: '.webp' };
    }
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!jpeg) throw new Error('Failed to encode image');
    return { blob: jpeg, contentType: 'image/jpeg', ext: '.jpg' };
}

/**
 * Build thumb + web-optimized full from one File (single decode).
 * GIF keeps original bytes for full (to preserve animation).
 *
 * @returns {{
 *   width: number,
 *   height: number,
 *   thumb: { blob: Blob, contentType: string },
 *   full: { blob: Blob, contentType: string, ext: string },
 * }}
 */
export async function createImageVariants(file) {
    const img = await loadImage(file);
    const { canvas: thumbCanvas, width, height } = drawScaled(img, THUMB_MAX_EDGE);
    const thumbEnc = await encodeWebpOrJpeg(thumbCanvas, THUMB_QUALITY);

    // Animated GIF: keep original as full so animation is not flattened
    if (file.type === 'image/gif') {
        return {
            width,
            height,
            thumb: { blob: thumbEnc.blob, contentType: thumbEnc.contentType },
            full: {
                blob: file,
                contentType: file.type || 'image/gif',
                ext: '.gif',
            },
        };
    }

    const { canvas: fullCanvas } = drawScaled(img, FULL_MAX_EDGE);
    const fullEnc = await encodeWebpOrJpeg(fullCanvas, FULL_QUALITY);

    // If encode somehow got larger than source and source is already small, keep source
    if (fullEnc.blob.size >= file.size && file.size < 400_000) {
        const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '.jpg';
        return {
            width,
            height,
            thumb: { blob: thumbEnc.blob, contentType: thumbEnc.contentType },
            full: { blob: file, contentType: file.type || 'image/jpeg', ext },
        };
    }

    return {
        width,
        height,
        thumb: { blob: thumbEnc.blob, contentType: thumbEnc.contentType },
        full: {
            blob: fullEnc.blob,
            contentType: fullEnc.contentType,
            ext: fullEnc.ext,
        },
    };
}

