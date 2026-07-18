import {
  PAPER_SIZES_MM,
  ROLL_PRODUCT_MIN_ALLOWANCE_MM,
  ROLL_STICKER_WIDTH_GAP_MM,
  SHEET_STICKER_WIDTH_GAPS_MM,
  STICKER_MIN_ALLOWANCE_MM,
} from '@/lib/ups-calculator/constants';
import type {
  FormType,
  Inputs,
  LayoutOptimization,
  ProductType,
} from '@/lib/ups-calculator/types';

/** Print width used by N labels across with a constant gap between them. */
export function usedPrintWidth(
  labelWidth: number,
  widthGap: number,
  acrossUps: number,
): number {
  if (acrossUps <= 0) return 0;
  return labelWidth * acrossUps + widthGap * (acrossUps - 1);
}

/**
 * Max labels that fit across a paper size while leaving at least minAllowance:
 *   (width × n) + (gap × (n − 1)) + minAllowance ≤ paperSize
 */
export function maxAcrossUps(
  labelWidth: number,
  widthGap: number,
  paperSize: number,
  minAllowance: number,
): number {
  if (labelWidth <= 0) return 0;
  const budget = paperSize - minAllowance + widthGap;
  const pitch = labelWidth + widthGap;
  if (budget < labelWidth || pitch <= 0) return 0;
  return Math.floor(budget / pitch);
}

/** Smallest stock paper size that can fit the required width. */
export function selectClosestPaperSize(requiredMm: number): number | null {
  const ascending = [...PAPER_SIZES_MM].sort((a, b) => a - b);
  for (const size of ascending) {
    if (size >= requiredMm) return size;
  }
  return null;
}

export function minAllowanceForProduct(product: ProductType): number {
  return product === 'sticker'
    ? STICKER_MIN_ALLOWANCE_MM
    : ROLL_PRODUCT_MIN_ALLOWANCE_MM;
}

/** Width-gap candidates implied by product + form. */
export function widthGapCandidates(
  product: ProductType,
  form: FormType,
): readonly number[] {
  if (product !== 'sticker') return [0];
  if (form === 'sheet') return SHEET_STICKER_WIDTH_GAPS_MM;
  return [ROLL_STICKER_WIDTH_GAP_MM];
}

/** Non-sticker products are always roll. */
export function effectiveForm(product: ProductType, form: FormType): FormType {
  return product === 'sticker' ? form : 'roll';
}

/**
 * Pick width gap + paper size that maximize across-width UPS, then prefer
 * smaller paper / tighter allowance (down to the product minimum).
 *
 * Paper size:
 *   required = (width × ups) + (gap × (ups − 1)) + minAllowance
 *   → smallest stock size in {240, 270, 300, 330} that is ≥ required.
 *
 * If a larger paper would leave allowance > label width, the smaller stock
 * size is chosen automatically via the required-width selection above.
 */
export function optimizeLayout(
  inputs: Pick<Inputs, 'product' | 'form' | 'labelWidth'>,
): LayoutOptimization | null {
  const form = effectiveForm(inputs.product, inputs.form);
  const minAllowance = minAllowanceForProduct(inputs.product);
  const gaps = widthGapCandidates(inputs.product, form);
  const width = inputs.labelWidth;

  if (width <= 0) return null;

  let best: LayoutOptimization | null = null;

  for (const widthGap of gaps) {
    // Max across-ups achievable on the largest stock paper for this gap.
    const largestPaper = PAPER_SIZES_MM[0];
    const acrossUps = maxAcrossUps(
      width,
      widthGap,
      largestPaper,
      minAllowance,
    );
    if (acrossUps < 1) continue;

    const used = usedPrintWidth(width, widthGap, acrossUps);
    const required = used + minAllowance;
    const paperSize = selectClosestPaperSize(required);
    if (paperSize === null) continue;

    // Confirm the ups still fit on the chosen (possibly smaller) paper.
    const fittedUps = maxAcrossUps(width, widthGap, paperSize, minAllowance);
    const finalUps = Math.min(acrossUps, fittedUps);
    if (finalUps < 1) continue;

    const finalUsed = usedPrintWidth(width, widthGap, finalUps);
    // Re-select paper after any ups adjustment (keeps allowance tight).
    const finalPaper = selectClosestPaperSize(finalUsed + minAllowance);
    if (finalPaper === null) continue;

    const candidate: LayoutOptimization = {
      widthGap,
      paperSize: finalPaper,
      acrossUps: finalUps,
      widthAllowance: finalPaper - finalUsed,
      minAllowance,
    };

    if (!best || isBetterLayout(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}

/** Prefer more UPS, then smaller paper, then tighter allowance, then smaller gap. */
function isBetterLayout(a: LayoutOptimization, b: LayoutOptimization): boolean {
  if (a.acrossUps !== b.acrossUps) return a.acrossUps > b.acrossUps;
  if (a.paperSize !== b.paperSize) return a.paperSize < b.paperSize;
  if (a.widthAllowance !== b.widthAllowance) {
    return a.widthAllowance < b.widthAllowance;
  }
  return a.widthGap < b.widthGap;
}

/** Resolved width/height gaps after product rules + optimization. */
export function resolvedGaps(inputs: Inputs): {
  widthGap: number;
  heightGap: number;
} {
  const layout = optimizeLayout(inputs);
  const widthGap = layout?.widthGap ?? 0;
  const heightGap = inputs.product === 'sticker' ? inputs.heightGap : 0;
  return { widthGap, heightGap };
}
