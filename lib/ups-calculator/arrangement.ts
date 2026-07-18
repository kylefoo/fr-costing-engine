import arrangementTable from '@/lib/ups-calculator/data/arrangement-table.json';
import { PAPER_SIZE_MM } from '@/lib/ups-calculator/constants';
import type { ArrangementRow, QuantityTier } from '@/lib/ups-calculator/types';

const table = arrangementTable as Record<string, ArrangementRow>;

/**
 * Estimator E44 / E45 quantity → diecut/arrangement tier ladder.
 */
export function quantityTier(qty: number): QuantityTier {
  if (qty <= 1000) return 'A';
  if (qty <= 3000) return 'B';
  if (qty <= 8000) return 'C';
  if (qty <= 20000) return 'D';
  if (qty <= 50000) return 'E';
  if (qty <= 100000) return 'F';
  return 'G';
}

/**
 * Estimator E11 / J11 lookup code:
 *   ROUNDUP(labelWidth) & ("G"|"S") & widthGap & "S" & (paperSize - 10)
 * Gap type is "S" only when both gaps are 0 (kiss-cut / sachet).
 */
export function buildCode(opts: {
  labelWidth: number;
  widthGap: number;
  heightGap: number;
  paperSize?: number;
}): string {
  const paperSize = opts.paperSize ?? PAPER_SIZE_MM;
  const gapType = opts.widthGap === 0 && opts.heightGap === 0 ? 'S' : 'G';
  return `${Math.ceil(opts.labelWidth)}${gapType}${opts.widthGap}S${paperSize - 10}`;
}

/** Look up the Panel//Section arrangement string for a code + quantity tier. */
export function lookupArrangement(code: string, tier: QuantityTier): string {
  const row = table[code];
  if (!row) return '';
  return row.arrangements[tier] ?? '';
}

/** Parse an arrangement like "07//01" into panel and section counts. */
export function parseArrangement(arrangement: string): {
  panels: number;
  sections: number;
} | null {
  if (!arrangement || !arrangement.includes('//')) return null;
  const left = Number(arrangement.slice(0, 2));
  const right = Number(arrangement.slice(-2));
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
    return null;
  }
  return { panels: left, sections: right };
}

export function hasArrangementCode(code: string): boolean {
  return code in table;
}
