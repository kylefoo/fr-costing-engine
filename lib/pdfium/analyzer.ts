import { PDFDocument, PDFName } from 'pdf-lib';
import type { BoxInfo, BoxName, AnalysisIssue, AnalysisResult, RenderedPage } from './types';
import { getPdfiumLibrary } from './loader';

const TOLERANCE_PT = 1.42; // 0.5 mm in PDF points (1 pt = 0.3528 mm)
const RENDER_SCALE = 150 / 72; // 150 DPI (sufficient for pixel sampling)
const BLEED_WHITE_LUMINANCE = 240; // out of 255; above this = near-white
const BLEED_WHITE_RATIO_THRESHOLD = 0.15; // flag if >15% of edge pixels are white

/** Convert PDF points to millimetres (rounded to 2dp) */
export function ptToMm(pt: number): number {
  return Math.round(pt * 0.352778 * 100) / 100;
}

const PAPER_SIZES: Array<{ name: string; w: number; h: number }> = [
  { name: 'A0',      w: 841,   h: 1189  },
  { name: 'A1',      w: 594,   h: 841   },
  { name: 'A2',      w: 420,   h: 594   },
  { name: 'A3',      w: 297,   h: 420   },
  { name: 'A4',      w: 210,   h: 297   },
  { name: 'A5',      w: 148,   h: 210   },
  { name: 'A6',      w: 105,   h: 148   },
  { name: 'B4',      w: 250,   h: 353   },
  { name: 'B5',      w: 176,   h: 250   },
  { name: 'Letter',  w: 215.9, h: 279.4 },
  { name: 'Legal',   w: 215.9, h: 355.6 },
  { name: 'Tabloid', w: 279.4, h: 431.8 },
];

const PAPER_SIZE_TOLERANCE_MM = 2;

/**
 * Returns the standard paper size name (e.g. "A4") for the given dimensions,
 * or null if no known size matches within PAPER_SIZE_TOLERANCE_MM.
 * Orientation-agnostic: portrait and landscape both match.
 */
export function detectPaperSize(widthMm: number, heightMm: number): string | null {
  const wMin = Math.min(widthMm, heightMm);
  const wMax = Math.max(widthMm, heightMm);
  for (const size of PAPER_SIZES) {
    const sMin = Math.min(size.w, size.h);
    const sMax = Math.max(size.w, size.h);
    if (
      Math.abs(wMin - sMin) <= PAPER_SIZE_TOLERANCE_MM &&
      Math.abs(wMax - sMax) <= PAPER_SIZE_TOLERANCE_MM
    ) {
      return size.name;
    }
  }
  return null;
}

/**
 * Returns true if `inner` is fully contained within `outer`,
 * allowing for TOLERANCE_PT rounding on all four edges.
 */
function boxContains(outer: BoxInfo, inner: BoxInfo): boolean {
  return (
    inner.x >= outer.x - TOLERANCE_PT &&
    inner.y >= outer.y - TOLERANCE_PT &&
    inner.x + inner.width <= outer.x + outer.width + TOLERANCE_PT &&
    inner.y + inner.height <= outer.y + outer.height + TOLERANCE_PT
  );
}

/** Returns true if two boxes are equal within TOLERANCE_PT on every edge. */
function boxesEqual(a: BoxInfo, b: BoxInfo): boolean {
  return (
    Math.abs(a.x - b.x) <= TOLERANCE_PT &&
    Math.abs(a.y - b.y) <= TOLERANCE_PT &&
    Math.abs(a.width - b.width) <= TOLERANCE_PT &&
    Math.abs(a.height - b.height) <= TOLERANCE_PT
  );
}

/**
 * Reads the four PDF boxes from page 0 using pdf-lib.
 *
 * `defined` is true only when the box key exists in the page's own PDF
 * dictionary. pdf-lib's getter methods fall back to parent boxes, so we must
 * check the raw dictionary to distinguish "explicitly set" from "inherited".
 */
function extractBoxes(pdfDoc: PDFDocument): BoxInfo[] {
  const page = pdfDoc.getPage(0);

  function readBox(name: BoxName, alwaysDefined: boolean): BoxInfo {
    const raw = page.node.get(PDFName.of(name));
    const defined = alwaysDefined || raw !== undefined;

    // pdf-lib getter falls back if not defined; we use it for the numeric value
    // whether or not it's defined (the defined flag tells us the truth).
    let rect: { x: number; y: number; width: number; height: number };
    if (name === 'MediaBox') rect = page.getMediaBox();
    else if (name === 'CropBox') rect = page.getCropBox();
    else if (name === 'BleedBox') rect = page.getBleedBox();
    else rect = page.getTrimBox();

    return { name, defined, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  return [
    readBox('MediaBox', true),  // required by PDF spec, always present
    readBox('CropBox', false),
    readBox('BleedBox', false),
    readBox('TrimBox', false),
  ];
}

/** Check 1: PDF box hierarchy consistency. */
function runBoxChecks(boxes: BoxInfo[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const media = boxes.find((b) => b.name === 'MediaBox')!;
  const bleed = boxes.find((b) => b.name === 'BleedBox')!;
  const trim  = boxes.find((b) => b.name === 'TrimBox')!;

  if (!trim.defined) {
    issues.push({ severity: 'warning', message: 'No TrimBox defined — printer has no trim guide' });
  }

  if (!bleed.defined) {
    issues.push({ severity: 'warning', message: 'No BleedBox defined' });
  } else if (trim.defined && boxesEqual(bleed, trim)) {
    issues.push({ severity: 'warning', message: 'BleedBox equals TrimBox — no bleed margin is defined' });
  }

  if (trim.defined && bleed.defined && !boxContains(bleed, trim)) {
    issues.push({ severity: 'error', message: 'TrimBox extends outside BleedBox' });
  }

  if (bleed.defined && !boxContains(media, bleed)) {
    issues.push({ severity: 'error', message: 'BleedBox is larger than the MediaBox (page boundary)' });
  }

  return issues;
}

/**
 * Check 2: Bleed fill coverage (heuristic).
 *
 * Samples a 2-pixel-wide strip along the inner edge of the BleedBox in the
 * rendered bitmap. If more than 15% of sampled pixels are near-white
 * (luminance > 240), the artwork likely does not reach the bleed edge.
 *
 * Coordinate mapping: PDF origin is bottom-left, bitmap origin is top-left.
 *   bitmap_x = (box.x - media.x) * scale
 *   bitmap_y = (media.y + media.height - box.y - box.height) * scale
 */
function runBleedCheck(rendered: RenderedPage, bleed: BoxInfo, media: BoxInfo): AnalysisIssue[] {
  if (!bleed.defined) return [];

  const { data, width, height, scale } = rendered;
  const STRIP = 2;

  // Map BleedBox PDF coords → bitmap pixels
  const bx = Math.round((bleed.x - media.x) * scale);
  const by = Math.round((media.y + media.height - bleed.y - bleed.height) * scale);
  const bw = Math.round(bleed.width * scale);
  const bh = Math.round(bleed.height * scale);

  const luminances: number[] = [];

  function sample(px: number, py: number) {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    // BGRA byte order: [B=i+0, G=i+1, R=i+2, A=i+3]
    const r = data[i + 2];
    const g = data[i + 1];
    const b = data[i + 0];
    luminances.push(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Top edge strip
  for (let x = bx; x < bx + bw; x++) {
    for (let s = 0; s < STRIP; s++) sample(x, by + s);
  }
  // Bottom edge strip
  for (let x = bx; x < bx + bw; x++) {
    for (let s = 0; s < STRIP; s++) sample(x, by + bh - 1 - s);
  }
  // Left edge strip
  for (let y = by; y < by + bh; y++) {
    for (let s = 0; s < STRIP; s++) sample(bx + s, y);
  }
  // Right edge strip
  for (let y = by; y < by + bh; y++) {
    for (let s = 0; s < STRIP; s++) sample(bx + bw - 1 - s, y);
  }

  if (luminances.length === 0) return [];

  const whiteCount = luminances.filter((l) => l > BLEED_WHITE_LUMINANCE).length;
  const whiteRatio = whiteCount / luminances.length;

  if (whiteRatio > BLEED_WHITE_RATIO_THRESHOLD) {
    return [{
      severity: 'warning',
      message: `Possible bleed gap — ${Math.round(whiteRatio * 100)}% of bleed edge pixels appear empty (heuristic)`,
    }];
  }
  return [];
}

/**
 * Main entry point. Loads `buffer` as a PDF/AI file, extracts boxes using
 * pdf-lib, renders page 0 via pdfium, runs both checks, returns an
 * AnalysisResult. Throws on parse failure so the caller can show an error.
 */
export async function analyzeFile(buffer: ArrayBuffer): Promise<AnalysisResult> {
  // --- Box extraction (pdf-lib) ---
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const boxes = extractBoxes(pdfDoc);
  const boxIssues = runBoxChecks(boxes);

  // --- Page rendering (pdfium) ---
  const library = await getPdfiumLibrary();
  const document = await library.loadDocument(new Uint8Array(buffer));
  const page = document.getPage(0);
  let renderResult!: Awaited<ReturnType<typeof page.render>>;
  try {
    renderResult = await page.render({
      scale: RENDER_SCALE,
      render: 'bitmap',
      // colorSpace defaults to 'BGRA'
    });
  } finally {
    document.destroy();
  }

  const rendered: RenderedPage = {
    data: renderResult.data,
    width: renderResult.width,
    height: renderResult.height,
    scale: RENDER_SCALE,
  };

  // --- Bleed fill check ---
  const media = boxes.find((b) => b.name === 'MediaBox')!;
  const bleed = boxes.find((b) => b.name === 'BleedBox')!;
  const bleedIssues = runBleedCheck(rendered, bleed, media);

  const allIssues = [...boxIssues, ...bleedIssues];
  const pass = !allIssues.some((i) => i.severity === 'error');

  return { boxes, issues: allIssues, rendered, pass };
}
