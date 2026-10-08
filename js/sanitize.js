/**
 * SafeSpace Image & Data Sanitizer
 * Strips EXIF metadata, GPS coordinates, and camera footprints
 * by re-encoding images via HTML5 Canvas.
 */

export const Sanitizer = {
    /**
     * Anonymizes an image file by re-drawing it on a Canvas and extracting clean pixels.
     * @param {File} file - Original user image file
     * @param {number} maxWidth - Maximum width (default 1920)
     * @param {number} maxHeight - Maximum height (default 1080)
     * @param {number} quality - JPEG compression quality (0.0 to 1.0)
     * @returns {Promise<{ blob: Blob, dataUrl: string, name: string, size: number }>}
     */
    async sanitizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
        if (!file.type.startsWith('image/')) {
            throw new Error('Nur Bilddateien (JPG, PNG, WebP) können verarbeitet werden.');
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let { width, height } = img;

                // Scale down if exceeding max dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                // Fill clean background in case of transparent png converted to jpeg
                ctx.fillStyle = '#0a0e16';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Export as clean JPEG without any EXIF or device header
                canvas.toBlob((blob) => {
                    if (!blob) {
                        return reject(new Error('Fehler bei der Bildanonymisierung.'));
                    }

                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const randomId = Math.random().toString(36).substring(2, 8);
                        resolve({
                            blob,
                            dataUrl: reader.result,
                            name: `safe_evidence_${randomId}.jpg`,
                            originalName: file.name,
                            size: blob.size
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                }, 'image/jpeg', quality);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Das Bild konnte nicht geladen werden.'));
            };

            img.src = url;
        });
    },

    /**
     * Sanitizes input strings against XSS.
     * @param {string} str
     * @returns {string}
     */
    escapeHtml(str) {
        if (!str) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(str).replace(/[&<>"']/g, m => map[m]);
    }
};
