# Size Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/size-checker` page where users upload a `.pdf` or `.ai` file and receive a visual analysis verifying PDF box consistency (MediaBox / CropBox / BleedBox / TrimBox) and bleed fill coverage.

**Architecture:** `pdf-lib` (pure-JS) extracts all PDF box metadata; `@hyzyla/pdfium` (WASM, lazy-loaded singleton) renders the page to a BGRA bitmap; the `AnalysisCanvas` component converts the bitmap to an RGBA canvas and draws colored box overlays; `ResultsPanel` shows a structured table of box values and flagged issues.

**Tech Stack:** `pdf-lib` 1.x, `@hyzyla/pdfium` 2.x (WASM), shadcn/ui (Table, Badge), React 19, Next.js 15 App Router static export.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `next.config.js` | Enable `asyncWebAssembly` webpack experiment |
| Create | `lib/pdfium/types.ts` | Shared TypeScript types |
| Create | `lib/pdfium/loader.ts` | pdfium WASM singleton |
| Create | `lib/pdfium/analyzer.ts` | Box extraction + both checks |
| Create | `components/nav/app-nav.tsx` | Top navigation bar |
| Modify | `app/layout.tsx` | Add `<AppNav />` to shell |
| Create | `components/size-checker/FileDropZone.tsx` | Drag-and-drop / click file input |
| Create | `components/size-checker/AnalysisCanvas.tsx` | Canvas render + box overlays |
| Create | `components/size-checker/ResultsPanel.tsx` | Box table + issues + pass/fail |
| Create | `app/size-checker/page.tsx` | Page state machine and layout |

---

## Task 1: Install dependencies and enable WASM in Next.js

**Files:**
- Modify: `next.config.js`

- [ ] **Step 1: Add dependencies**

```bash
yarn add @hyzyla/pdfium pdf-lib
```

Expected: both packages resolved, `yarn.lock` updated, no peer dep warnings.

- [ ] **Step 2: Enable asyncWebAssembly in next.config.js**

Replace the entire `next.config.js` with:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '_static',
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

module.exports = nextConfig;
```

- [ ] **Step 3: Add shadcn Table and Badge components**

```bash
yarn dlx shadcn@latest add table badge
```

Expected: `components/ui/table.tsx` and `components/ui/badge.tsx` created.

- [ ] **Step 4: Verify build still passes**

```bash
yarn build
```

Expected: static export to `_static/` with no errors.

- [ ] **Step 5: Commit**

```bash
git add next.config.js package.json yarn.lock components/ui/table.tsx components/ui/badge.tsx
git commit -m "feat: install pdfium/pdf-lib, enable WASM, add Table+Badge"
```

---

## Task 2: Define shared types

**Files:**
- Create: `lib/pdfium/types.ts`

- [ ] **Step 1: Create `lib/pdfium/types.ts`**

```typescript
export type BoxName = 'MediaBox' | 'CropBox' | 'BleedBox' | 'TrimBox';

export interface BoxInfo {
  name: BoxName;
  /** true if explicitly set in this page's PDF dictionary (not inherited/fallback) */
  defined: boolean;
  /** lower-left x in PDF points */
  x: number;
  /** lower-left y in PDF points */
  y: number;
  /** width in PDF points */
  width: number;
  /** height in PDF points */
  height: number;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface AnalysisIssue {
  severity: IssueSeverity;
  message: string;
}

/** Rendered page bitmap in BGRA format */
export interface RenderedPage {
  /** Raw pixel data: BGRA, 4 bytes per pixel */
  data: Uint8Array;
  width: number;
  height: number;
  /** Scale factor used: pixels = PDF_points * scale */
  scale: number;
}

export interface AnalysisResult {
  boxes: BoxInfo[];
  issues: AnalysisIssue[];
  rendered: RenderedPage;
  /** true = zero 'error' severity issues; warnings do not affect pass/fail */
  pass: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pdfium/types.ts
git commit -m "feat: add pdfium shared types"
```

---

## Task 3: pdfium loader singleton

**Files:**
- Create: `lib/pdfium/loader.ts`

- [ ] **Step 1: Create `lib/pdfium/loader.ts`**

```typescript
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
```

- [ ] **Step 2: Verify lint**

```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pdfium/loader.ts
git commit -m "feat: add pdfium lazy-load singleton"
```

---

## Task 4: PDF analyzer

**Files:**
- Create: `lib/pdfium/analyzer.ts`

This is the core analysis module. It uses `pdf-lib` to read box metadata and `@hyzyla/pdfium` to render the page.

**Key coordinate note:** PDF origin is bottom-left; canvas/bitmap origin is top-left. When mapping PDF box coordinates to bitmap pixels, the Y axis is flipped:
- `bitmap_y = (media.height - box.y - box.height) * scale`
- `bitmap_x = box.x * scale` (assuming media.x = 0, which is standard)

**BGRA note:** pdfium renders BGRA by default. Canvas ImageData requires RGBA. Conversion: `R = data[i+2], G = data[i+1], B = data[i], A = data[i+3]` (swap channels 0 and 2). The AnalysisCanvas component handles this conversion.

- [ ] **Step 1: Create `lib/pdfium/analyzer.ts`**

```typescript
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

  const renderResult = await page.render({
    scale: RENDER_SCALE,
    render: 'bitmap',
    // colorSpace defaults to 'BGRA'
  });

  document.destroy();

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
```

- [ ] **Step 2: Run lint**

```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pdfium/analyzer.ts
git commit -m "feat: add PDF analyzer (box checks + bleed heuristic)"
```

---

## Task 5: App navigation shell

**Files:**
- Create: `components/nav/app-nav.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/nav/app-nav.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tools = [
  { label: 'Size Checker', href: '/size-checker' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-semibold text-foreground tracking-tight">Fastroll</span>
        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                pathname === tool.href
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {tool.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Update `app/layout.tsx` to add `<AppNav />`**

Replace the file with:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppNav } from '@/components/nav/app-nav';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'fr-costing-engine',
  description: 'Costing engine app',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Run build**

```bash
yarn build
```

Expected: static export succeeds, `/` and nav render.

- [ ] **Step 4: Commit**

```bash
git add components/nav/app-nav.tsx app/layout.tsx
git commit -m "feat: add app navigation shell"
```

---

## Task 6: FileDropZone component

**Files:**
- Create: `components/size-checker/FileDropZone.tsx`

- [ ] **Step 1: Create `components/size-checker/FileDropZone.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

interface Props {
  onFile: (buffer: ArrayBuffer, filename: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFile, onError, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.name.match(/\.(pdf|ai)$/i)) {
      onError('Only .pdf and .ai files are supported.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      onError('File is too large to analyze in the browser (max 200 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        onFile(e.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload file"
      className={cn(
        'border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-3',
        'cursor-pointer transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30',
        disabled && 'opacity-50 pointer-events-none',
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <UploadCloud className="size-10 text-muted-foreground" />
      <div className="text-center">
        <p className="font-medium text-foreground">Drop your file here</p>
        <p className="text-sm text-muted-foreground mt-1">.pdf or .ai · max 200 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.ai,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/size-checker/FileDropZone.tsx
git commit -m "feat: add FileDropZone component"
```

---

## Task 7: AnalysisCanvas component

**Files:**
- Create: `components/size-checker/AnalysisCanvas.tsx`

This component:
1. Converts the BGRA bitmap to RGBA and draws it onto a `<canvas>` via `ImageData`.
2. Draws colored outlines for each defined PDF box.
3. Draws a dimension label (in mm) for each visible box.

**Coordinate system:** PDF boxes use bottom-left origin; canvas uses top-left. For a box `{ x, y, width, height }` (PDF points) and a MediaBox `media`:
- `canvas_x = (box.x - media.x) * scale`
- `canvas_y = (media.y + media.height - box.y - box.height) * scale`
- `canvas_w = box.width * scale`
- `canvas_h = box.height * scale`

- [ ] **Step 1: Create `components/size-checker/AnalysisCanvas.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { AnalysisResult, BoxInfo } from '@/lib/pdfium/types';
import { ptToMm } from '@/lib/pdfium/analyzer';

const BOX_STYLES: Record<string, string> = {
  MediaBox:  'rgba(156, 163, 175, 0.9)',
  CropBox:   'rgba(34, 197, 94, 0.9)',
  BleedBox:  'rgba(239, 68, 68, 0.9)',
  TrimBox:   'rgba(59, 130, 246, 0.9)',
};

interface Props {
  result: AnalysisResult;
}

export function AnalysisCanvas({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rendered, boxes } = result;
    const { data, width, height, scale } = rendered;

    canvas.width = width;
    canvas.height = height;

    // Convert BGRA → RGBA: pdfium renders BGRA, canvas ImageData requires RGBA.
    // BGRA layout: [B=0, G=1, R=2, A=3] per pixel.
    const rgba = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      rgba[i + 0] = data[i + 2]; // R
      rgba[i + 1] = data[i + 1]; // G
      rgba[i + 2] = data[i + 0]; // B
      rgba[i + 3] = data[i + 3]; // A
    }
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

    const media = boxes.find((b) => b.name === 'MediaBox') as BoxInfo;
    const labelSize = Math.max(10, Math.round(11 * scale));
    ctx.font = `${labelSize}px ui-monospace, monospace`;
    ctx.lineWidth = Math.max(1, scale);

    for (const box of boxes) {
      if (!box.defined) continue;

      const px = (box.x - media.x) * scale;
      const py = (media.y + media.height - box.y - box.height) * scale;
      const pw = box.width * scale;
      const ph = box.height * scale;

      const color = BOX_STYLES[box.name] ?? 'rgba(200,200,200,0.9)';
      ctx.strokeStyle = color;
      ctx.strokeRect(px, py, pw, ph);

      // Label: "TrimBox 210.00 × 297.00 mm"
      const label = `${box.name}  ${ptToMm(box.width).toFixed(2)} × ${ptToMm(box.height).toFixed(2)} mm`;
      ctx.fillStyle = color;
      ctx.fillText(label, px + 4, py + labelSize + 2);
    }
  }, [result]);

  return (
    <div className="overflow-auto rounded-lg border border-border bg-checkerboard">
      <canvas
        ref={canvasRef}
        className="max-w-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add checkerboard pattern to `app/globals.css` (helps visualise transparent areas)**

In `app/globals.css`, append inside the `:root` block or as a utility class:

```css
.bg-checkerboard {
  background-image:
    linear-gradient(45deg, oklch(0.9 0 0) 25%, transparent 25%),
    linear-gradient(-45deg, oklch(0.9 0 0) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, oklch(0.9 0 0) 75%),
    linear-gradient(-45deg, transparent 75%, oklch(0.9 0 0) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: oklch(0.95 0 0);
}
```

- [ ] **Step 3: Commit**

```bash
git add components/size-checker/AnalysisCanvas.tsx app/globals.css
git commit -m "feat: add AnalysisCanvas with box overlays"
```

---

## Task 8: ResultsPanel component

**Files:**
- Create: `components/size-checker/ResultsPanel.tsx`

- [ ] **Step 1: Create `components/size-checker/ResultsPanel.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import type { AnalysisResult } from '@/lib/pdfium/types';
import { ptToMm } from '@/lib/pdfium/analyzer';

const SEVERITY_CLASS: Record<string, string> = {
  error:   'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info:    'text-muted-foreground',
};

interface Props {
  result: AnalysisResult;
}

export function ResultsPanel({ result }: Props) {
  const { boxes, issues, pass } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Result</h2>
        <Badge variant={pass ? 'default' : 'destructive'}>
          {pass ? 'PASS' : 'FAIL'}
        </Badge>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Page Boxes</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Box</TableHead>
              <TableHead>Width</TableHead>
              <TableHead>Height</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boxes.map((box) => (
              <TableRow key={box.name}>
                <TableCell className="font-mono text-sm">{box.name}</TableCell>
                <TableCell>
                  {box.defined ? `${ptToMm(box.width).toFixed(2)} mm` : '—'}
                </TableCell>
                <TableCell>
                  {box.defined ? `${ptToMm(box.height).toFixed(2)} mm` : '—'}
                </TableCell>
                <TableCell>
                  <span className={box.defined ? 'text-foreground' : 'text-muted-foreground'}>
                    {box.defined ? 'Defined' : 'Not defined'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {issues.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Issues</h3>
          <ul className="flex flex-col gap-2">
            {issues.map((issue, i) => (
              <li key={i} className={`text-sm ${SEVERITY_CLASS[issue.severity] ?? ''}`}>
                <span className="font-semibold capitalize">[{issue.severity}]</span>{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No issues found.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/size-checker/ResultsPanel.tsx
git commit -m "feat: add ResultsPanel component"
```

---

## Task 9: Size Checker page

**Files:**
- Create: `app/size-checker/page.tsx`

The page manages a state machine with four states: `idle → loading → done | error`. Loading has two sub-labels shown sequentially:
1. "Loading analysis engine…" while pdfium WASM initialises.
2. "Analyzing file…" while the analysis runs.

- [ ] **Step 1: Create `app/size-checker/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FileDropZone } from '@/components/size-checker/FileDropZone';
import { AnalysisCanvas } from '@/components/size-checker/AnalysisCanvas';
import { ResultsPanel } from '@/components/size-checker/ResultsPanel';
import { analyzeFile } from '@/lib/pdfium/analyzer';
import type { AnalysisResult } from '@/lib/pdfium/types';

type PageState =
  | { status: 'idle' }
  | { status: 'loading'; label: string }
  | { status: 'done'; result: AnalysisResult; filename: string }
  | { status: 'error'; message: string };

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/wasm|fetch|network/i.test(msg)) {
    return 'Analysis engine failed to load. Check your connection and try again.';
  }
  if (/password|encrypt/i.test(msg)) {
    return 'This file is password-protected and cannot be analyzed.';
  }
  if (/invalid|parse|unexpected|corrupt/i.test(msg)) {
    return 'Could not parse file. Is this a valid PDF or Illustrator file? Old .ai files without an embedded PDF are not supported — export as PDF first.';
  }
  return `Analysis failed: ${msg}`;
}

export default function SizeCheckerPage() {
  const [state, setState] = useState<PageState>({ status: 'idle' });

  async function handleFile(buffer: ArrayBuffer, filename: string) {
    try {
      // Phase 1: warm up pdfium (triggers WASM download on first use)
      setState({ status: 'loading', label: 'Loading analysis engine…' });
      const { getPdfiumLibrary } = await import('@/lib/pdfium/loader');
      await getPdfiumLibrary();

      // Phase 2: run analysis
      setState({ status: 'loading', label: 'Analyzing file…' });
      const result = await analyzeFile(buffer);

      setState({ status: 'done', result, filename });
    } catch (err) {
      setState({ status: 'error', message: classifyError(err) });
    }
  }

  return (
    <main className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Size Checker</h1>
        <p className="text-muted-foreground mt-1">
          Upload a PDF or Illustrator file to verify its page boxes are correct for print production.
        </p>
      </div>

      <FileDropZone
        onFile={handleFile}
        onError={(message) => setState({ status: 'error', message })}
        disabled={state.status === 'loading'}
      />

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 mt-6 text-muted-foreground">
          <Loader2 className="animate-spin size-4" />
          <span className="text-sm">{state.label}</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {state.message}
        </div>
      )}

      {state.status === 'done' && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Analyzing: <span className="font-medium text-foreground">{state.filename}</span>
            {' · '}
            <button
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => setState({ status: 'idle' })}
            >
              Upload another file
            </button>
          </p>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <AnalysisCanvas result={state.result} />
            <ResultsPanel result={state.result} />
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/size-checker/page.tsx
git commit -m "feat: add /size-checker page"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full build and lint**

```bash
yarn build && yarn lint
```

Expected output from `yarn build`: static export to `_static/` with no errors, pages listed including `/size-checker`.
Expected output from `yarn lint`: "No ESLint warnings or errors."

- [ ] **Step 2: Manual smoke test**

```bash
yarn start
```

Open `http://localhost:8080/size-checker` and:
- Confirm the top nav shows "Fastroll" and "Size Checker" (active/highlighted).
- Drop a PDF with defined TrimBox/BleedBox → canvas renders with colored outlines, ResultsPanel shows dimensions in mm.
- Drop a simple PDF with only MediaBox → warnings appear: "No TrimBox defined", "No BleedBox defined"; PASS badge (warnings don't fail).
- Drop a non-PDF file → inline error "Only .pdf and .ai files are supported."

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: size checker MVP complete"
```

---

## Known limitations (v1)

- Only page 1 is analyzed.
- Old Illustrator files (pre-CS2) without embedded PDF will surface a parse error.
- Bleed fill check is heuristic (pixel luminance); white-background designs may produce false positives.
- CutContour / Dieline spot color detection for sticker sheets is out of scope.
- pdfium renders based on the page's natural dimensions (typically MediaBox). If a file sets a CropBox that is smaller than MediaBox, the rendered bitmap may not cover the full MediaBox, causing box overlays near the bleed edge to fall outside the visible canvas area.
