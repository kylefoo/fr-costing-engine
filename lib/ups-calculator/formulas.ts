import costingMaster from '@/lib/ups-calculator/data/costing-master.json';
import {
  FRAME_HEIGHT_MM,
  FRAME_TIER_WASTAGE_BASIS_MM,
  PAPER_SIZE_MM,
  WASTAGE_BASIS_MM,
} from '@/lib/ups-calculator/constants';
import type { ColorCount, CostingTierPrices } from '@/lib/ups-calculator/types';

const costing = costingMaster as Record<string, CostingTierPrices>;

/** Excel CEILING(n, significance) for positive numbers. */
export function excelCeiling(n: number, significance: number): number {
  if (significance === 0) return 0;
  return Math.ceil(n / significance) * significance;
}

/** Excel ROUND(n, 0) — half away from zero. */
export function excelRound(n: number): number {
  return n >= 0 ? Math.round(n) : -Math.round(-n);
}

/** Excel ROUNDUP(n, 0) for positive numbers. */
export function excelRoundUp(n: number): number {
  return Math.ceil(n);
}

/** Estimator E16 — rows along the 980 mm frame. */
export function rowsPerFrame(labelHeight: number, heightGap: number): number {
  const pitch = labelHeight + heightGap;
  if (pitch <= 0) return 0;
  return Math.floor(FRAME_HEIGHT_MM / pitch);
}

/**
 * Estimator E14 (B8=1 branch) — material wastage in pcs.
 * CEILING(E51 / (height + heightGap) * panelsTotal, 50)
 */
export function materialWastage(
  panelsTotal: number,
  labelHeight: number,
  heightGap: number,
): number {
  const pitch = labelHeight + heightGap;
  if (pitch <= 0 || panelsTotal <= 0) return 0;
  return excelCeiling((WASTAGE_BASIS_MM / pitch) * panelsTotal, 50);
}

/**
 * Estimator E61 (B8=1 branch) — secondary wastage used for frame-tier pricing.
 * Same shape as materialWastage but with F51 = 9000.
 */
export function frameTierWastage(
  panelsTotal: number,
  labelHeight: number,
  heightGap: number,
): number {
  const pitch = labelHeight + heightGap;
  if (pitch <= 0 || panelsTotal <= 0) return 0;
  return excelCeiling((FRAME_TIER_WASTAGE_BASIS_MM / pitch) * panelsTotal, 50);
}

/** Estimator E18 — ROUND((qty + wastage) / upsPerFrame, 0). */
export function framesNeeded(
  qty: number,
  wastage: number,
  upsPerFrame: number,
): number {
  if (upsPerFrame <= 0) return 0;
  return excelRound((qty + wastage) / upsPerFrame);
}

/**
 * Estimator E26 — actual print width (mm) from arrangement + label width + width gap.
 */
export function actualPrintWidth(
  panels: number,
  sections: number,
  labelWidth: number,
  widthGap: number,
): number {
  if (panels === 1 && sections === 1) {
    return panels * sections * labelWidth;
  }
  if (sections === 1) {
    return (panels - 1) * widthGap + panels * labelWidth * sections;
  }
  return (panels * sections - 1) * widthGap + panels * labelWidth * sections;
}

/** Estimator E19 — paper size minus actual print width. */
export function widthAllowance(printWidth: number, paperSize = PAPER_SIZE_MM): number {
  return paperSize - printWidth;
}

/**
 * Estimator E21 —
 * ROUNDUP(((qty + wastage) * (CEIL(labelWidth) + heightGap) * (labelHeight + widthGap)) / 1e6, 0)
 */
export function totalMaterialM2(
  qty: number,
  wastage: number,
  labelWidth: number,
  labelHeight: number,
  widthGap: number,
  heightGap: number,
): number {
  const areaMm2 =
    (qty + wastage) *
    (Math.ceil(labelWidth) + heightGap) *
    (labelHeight + widthGap);
  return excelRoundUp(areaMm2 / 1_000_000);
}

/**
 * Estimator E60 → E53 — rounded frame-tier quantity used as the pricing key scale.
 * E60 = CEILING(ROUND((qty + E61) / (panelsTotal * rows / 2), 0), 1)
 * E53 = IF(E60 < 2000, CEILING(E60, 50), E60)
 */
export function frameTierRound(
  qty: number,
  tierWastage: number,
  panelsTotal: number,
  rows: number,
): number {
  const denom = (panelsTotal * rows) / 2;
  if (denom <= 0) return 0;
  const raw = excelCeiling(excelRound((qty + tierWastage) / denom), 1);
  return raw < 2000 ? excelCeiling(raw, 50) : raw;
}

/**
 * Estimator E52 — map rounded frame count to a COSTING FORMULA MASTER key.
 */
export function frameTierKey(rounded: number): string {
  if (rounded > 10000) return 'ABOVE 10001';
  if (rounded > 5000) return 'ABOVE 5001';
  if (rounded > 2000) return 'ABOVE 2001';
  return String(rounded);
}

const COLOR_PRICE_KEY: Record<ColorCount, keyof CostingTierPrices> = {
  1: 'perFrame1c',
  2: 'perFrame2c',
  3: 'perFrame3c',
  4: 'perFrame4c',
  5: 'perFrame5c',
  6: 'perFrame6c',
  7: 'perFrame7c',
  8: 'perFrame8c',
};

/**
 * Estimator E22 (Direct Customer branch) —
 * VLOOKUP(frameTier, costing, colorCol) * frameTierRound
 */
export function labelChargerRm(
  tierKey: string,
  colors: ColorCount,
  roundedFrames: number,
): number | null {
  const row = costing[tierKey];
  if (!row) return null;
  const unit = row[COLOR_PRICE_KEY[colors]];
  if (unit === undefined || unit === null) return null;
  // Round to 4 dp to avoid IEEE float noise (e.g. 137.79999999999998)
  return Math.round(unit * roundedFrames * 10_000) / 10_000;
}
