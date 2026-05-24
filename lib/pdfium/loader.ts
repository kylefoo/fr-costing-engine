import type { PDFiumLibrary as PDFiumLibraryType } from '@hyzyla/pdfium';

let libraryPromise: Promise<PDFiumLibraryType> | null = null;

/**
 * Returns the pdfium library instance for browser use, initializing it on first call.
 * The WASM binary is fetched from the public URL and the result is cached as a
 * module-level singleton — subsequent calls return the same Promise.
 */
export async function getPdfiumLibrary(): Promise<PDFiumLibraryType> {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const { PDFiumLibrary } = await import('@hyzyla/pdfium');
      return PDFiumLibrary.init({ wasmUrl: '/pdfium.wasm' });
    })().catch((err) => {
      libraryPromise = null; // clear so the next call can retry
      throw err;
    });
  }
  return libraryPromise;
}

let serverLibraryPromise: Promise<PDFiumLibraryType> | null = null;

/**
 * Returns the pdfium library instance for server-side (Node.js) use.
 * Loads the WASM file from the filesystem using a file:// URL, which
 * Node 22's built-in fetch supports natively.
 */
export async function getPdfiumLibraryServer(): Promise<PDFiumLibraryType> {
  if (!serverLibraryPromise) {
    serverLibraryPromise = (async () => {
      const path = await import('path');
      const { PDFiumLibrary } = await import('@hyzyla/pdfium');
      const wasmPath = path.join(process.cwd(), 'public', 'pdfium.wasm');
      const wasmUrl = `file://${wasmPath}`;
      return PDFiumLibrary.init({ wasmUrl });
    })().catch((err) => {
      serverLibraryPromise = null;
      throw err;
    });
  }
  return serverLibraryPromise;
}
