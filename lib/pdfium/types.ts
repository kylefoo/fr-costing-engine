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
