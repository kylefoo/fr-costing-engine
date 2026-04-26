# Size Checker — Design Spec

**Date:** 2026-04-26  
**Status:** Approved  
**Context:** fr-costing-engine — Next.js 15 static export, multi-tool app shell

---

## Overview

A browser-based tool for printing manufacturers to verify that uploaded `.pdf` or `.ai` files are the correct physical size. Specifically, it checks:

1. **Box hierarchy consistency** — whether the PDF's MediaBox, TrimBox, BleedBox, and CropBox are self-consistent and correctly nested.
2. **Bleed fill coverage** — whether the artwork content actually extends to the bleed edge (heuristic, pixel-based).

All analysis runs entirely client-side (required by the static export constraint). The analysis engine is pdfium compiled to WebAssembly (`@hyzyla/pdfium`), chosen for highest fidelity and correct handling of both PDF and modern Illustrator files.

---

## Scope

- **In scope:** Single-page analysis (page 1 only), `.pdf` and `.ai` inputs, box consistency checks, bleed fill heuristic, annotated canvas preview, top navigation shell for future tools.
- **Out of scope for v1:** Multi-page analysis, CMYK color space inspection, font embedding checks, ICC profile validation, CutContour/Dieline spot color path detection (used for sticker sheets and die-cut jobs — the TrimBox on a sticker sheet describes the outer sheet boundary only; individual cut shapes live in PDF content streams as spot color paths, not in box metadata).

---

## Architecture

### File Structure (new files only)

```
app/
  size-checker/
    page.tsx                  — route page, orchestrates state

components/
  nav/
    app-nav.tsx               — top navigation bar (multi-tool shell)
  size-checker/
    FileDropZone.tsx          — drag-and-drop / click file input
    AnalysisCanvas.tsx        — pdfium bitmap render + box overlays
    ResultsPanel.tsx          — box values table + issues list + pass/fail badge

lib/
  pdfium/
    loader.ts                 — lazy-loads pdfium WASM (singleton)
    analyzer.ts               — extracts boxes, runs checks, returns AnalysisResult
    types.ts                  — shared TypeScript types
```

### Data Flow

```
User drops file
  → FileDropZone reads ArrayBuffer
  → loader.ts lazy-loads pdfium WASM (once, cached as module-level singleton)
    — subsequent uploads reuse the already-initialized instance; no reload
  → analyzer.ts:
      - parse file via pdfium
      - extract MediaBox, CropBox, BleedBox, TrimBox (page 1)
      - render page 1 to bitmap
      - run box hierarchy check
      - run bleed fill heuristic (pixel sampling at BleedBox inner edge)
      - return AnalysisResult
  → AnalysisCanvas renders bitmap + draws colored box outlines + dimension labels
  → ResultsPanel shows box value table + issues list + overall PASS/FAIL
```

---

## Analysis Engine

### PDF Box Extraction

pdfium exposes all four box types per page. All values are in PDF user units (1 pt = 1/72 inch = 0.3528 mm). The analyzer converts to mm for display.

**Tolerance:** 0.5 mm = ~1.42 pt. Differences smaller than this are ignored in all checks.

### Check 1 — Box Hierarchy Consistency

Flags the following as issues:

| Condition | Severity | Message |
|---|---|---|
| TrimBox absent | warning | No TrimBox defined — printer has no trim guide |
| BleedBox absent or equal to TrimBox | warning | No bleed defined |
| TrimBox not inside BleedBox | error | TrimBox extends outside BleedBox |
| BleedBox not inside MediaBox | error | BleedBox larger than page (MediaBox) |
| CropBox absent | info | No CropBox defined (usually fine) |

### Check 2 — Bleed Fill Coverage (heuristic)

1. Render page 1 to a bitmap via pdfium at a fixed resolution (150 DPI sufficient).
2. Map the BleedBox boundary to pixel coordinates.
3. Sample a 2px-wide strip along the inner edge of the BleedBox (all four sides).
4. If >15% of sampled pixels are white or near-white (luminance > 240) → flag as warning: "Possible bleed gap — content may not reach the bleed edge."
5. Label this result as a heuristic in the UI ("possible bleed gap").

---

## UI Design

### App Shell

`app/layout.tsx` gains a top navigation bar (`AppNav`) with links to available tools. The current tool is highlighted. Designed to accommodate future tools without structural changes.

### Size Checker Page (`/size-checker`)

**States:**

1. **Idle** — FileDropZone centered on page, accepts `.pdf` / `.ai`, max 200 MB.
2. **Loading engine** — spinner: "Loading analysis engine…" (WASM download, first use only).
3. **Analyzing** — spinner: "Analyzing file…".
4. **Results** — two-column layout: AnalysisCanvas (left) + ResultsPanel (right).
5. **Error** — inline error message, drop zone still accessible.

**AnalysisCanvas overlays:**

- MediaBox: gray outline
- CropBox: green outline
- BleedBox: red outline
- TrimBox: blue outline
- Dimension labels (in mm) on each box edge

**ResultsPanel:**

- Box values table: one row per box, columns: Box Type | Width (mm) | Height (mm) | Defined?
- Issues list: colored by severity (red = error, yellow = warning, gray = info)
- Overall badge: green PASS (zero errors) or red FAIL (one or more errors)
- Warnings do not affect PASS/FAIL

### Error States

| Condition | Message |
|---|---|
| File not parseable | "Could not parse file. Is this a valid PDF or Illustrator file?" |
| Old .ai without embedded PDF | "This Illustrator file does not contain an embedded PDF. Please export as PDF first." |
| File > 200 MB | "File is too large to analyze in the browser (max 200 MB)." |
| pdfium WASM load failure | "Analysis engine failed to load. Check your connection and try again." |

---

## Dependencies

- `@hyzyla/pdfium` — pdfium WASM wrapper (lazy-loaded, not in initial bundle)
- No other new runtime dependencies

---

## Constraints

- Static export: no API routes, no server-side processing.
- All file handling in the browser (FileReader / ArrayBuffer).
- pdfium WASM lazy-loaded on first use to avoid blocking initial render.
- Only page 1 is analyzed in v1.
