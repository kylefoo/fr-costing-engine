import type { PDFiumLibrary as PDFiumLibraryType } from '@hyzyla/pdfium';

let libraryPromise: Promise<PDFiumLibraryType> | null = null;

/**
 * Returns the pdfium library instance, initializing it on first call.
 * The WASM binary is downloaded lazily and the result is cached as a
 * module-level singleton — subsequent calls return the same Promise.
 */
export async function getPdfiumLibrary(): Promise<PDFiumLibraryType> {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const { PDFiumLibrary } = await import('@hyzyla/pdfium');
      return PDFiumLibrary.init();
    })();
  }
  return libraryPromise;
}
