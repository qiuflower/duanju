// --- Strict Image Format Validation ---
export const validateImageFormats = (images: string[]): void => {
    const validImages = images.filter(img => img && img.trim().length > 0);
    if (validImages.length === 0) return;

    const isHttpUrlValid = (s: string) => /^https?:\/\//i.test(s);
    const isBase64Valid = (s: string) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(s);

    const hasUrl = validImages.some(isHttpUrlValid);
    const hasBase64 = validImages.some(isBase64Valid);

    if (hasUrl && hasBase64) {
        throw new Error("Image Format Error: Mixed formats (URL and Base64) are not allowed. Please ensure all images are consistent.");
    }

    if (hasUrl) {
        const invalidUrls = validImages.filter(url => !isHttpUrlValid(url));
        if (invalidUrls.length > 0) {
            throw new Error("Image Format Error: Invalid URL format. All URLs must start with http:// or https://.");
        }
    } else if (hasBase64) {
        const invalidBase64 = validImages.filter(b64 => !isBase64Valid(b64));
        if (invalidBase64.length > 0) {
            throw new Error("Image Format Error: Invalid Base64 format. Must start with 'data:image/...;base64,'.");
        }

        const getMime = (b64: string) => {
            const match = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
            return match ? match[1].toLowerCase() : null;
        };

        const firstMime = getMime(validImages[0]);
        const inconsistent = validImages.some(img => getMime(img) !== firstMime);
        if (inconsistent) {
            throw new Error(`Image Format Error: Inconsistent Base64 image types. All images must be of the same type (e.g. all ${firstMime}).`);
        }
    } else {
        throw new Error("Image Format Error: Invalid image format detected. Please use valid URLs or Base64 strings.");
    }
};
