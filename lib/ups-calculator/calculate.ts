import {
  buildCode,
  lookupArrangement,
  parseArrangement,
  quantityTier,
} from '@/lib/ups-calculator/arrangement';
import { QUANTITIES } from '@/lib/ups-calculator/constants';
import {
  frameTierKey,
  frameTierRound,
  frameTierWastage,
  framesNeeded,
  labelChargerRm,
  materialWastage,
  rowsPerFrame,
  totalMaterialM2,
} from '@/lib/ups-calculator/formulas';
import { optimizeLayout, resolvedGaps } from '@/lib/ups-calculator/optimize';
import type { ColumnResult, Inputs, LayoutOptimization } from '@/lib/ups-calculator/types';

export type CalculateUpsResult = {
  columns: ColumnResult[];
  layout: LayoutOptimization | null;
  /** Effective gaps used in the calculation (width gap may differ from inputs). */
  widthGap: number;
  heightGap: number;
  lookupCode: string;
};

/**
 * Port of Estimator rows 14–22 across the five quantity columns (E:I),
 * with product/form-driven gap + paper-size optimization.
 */
export function calculateUps(inputs: Inputs): CalculateUpsResult {
  const layout = optimizeLayout(inputs);
  const { widthGap, heightGap } = resolvedGaps(inputs);
  const { labelWidth, labelHeight, colors } = inputs;

  const paperSize = layout?.paperSize;
  const lookupCode =
    paperSize !== undefined
      ? buildCode({ labelWidth, widthGap, heightGap, paperSize })
      : buildCode({ labelWidth, widthGap, heightGap });

  const rows = rowsPerFrame(labelHeight, heightGap);

  if (!layout || layout.acrossUps < 1 || rows <= 0) {
    return {
      columns: QUANTITIES.map((quantity) => emptyColumn(quantity)),
      layout: null,
      widthGap,
      heightGap,
      lookupCode,
    };
  }

  const acrossUps = layout.acrossUps;
  const geometricArrangement = `${String(acrossUps).padStart(2, '0')}//01`;

  const columns = QUANTITIES.map((quantity) => {
    const tier = quantityTier(quantity);
    const lookedUp = lookupArrangement(lookupCode, tier);
    const parsedLookup = parseArrangement(lookedUp);
    // Geometric across-ups drive packing / paper size. Surface the Excel
    // arrangement string only when its panel×section total matches.
    const lookupPanels =
      parsedLookup !== null ? parsedLookup.panels * parsedLookup.sections : 0;
    const arrangement =
      lookupPanels === acrossUps && lookedUp
        ? lookedUp
        : geometricArrangement;

    const panelsTotal = acrossUps;
    const upsPerFrame = panelsTotal * rows;
    const wastage = materialWastage(panelsTotal, labelHeight, heightGap);
    const frames = framesNeeded(quantity, wastage, upsPerFrame);
    const materialM2 = totalMaterialM2(
      quantity,
      wastage,
      labelWidth,
      labelHeight,
      widthGap,
      heightGap,
    );

    const tierWastage = frameTierWastage(panelsTotal, labelHeight, heightGap);
    const rounded = frameTierRound(quantity, tierWastage, panelsTotal, rows);
    const tierKey = frameTierKey(rounded);
    const charger = labelChargerRm(tierKey, colors, rounded);

    return {
      quantity,
      arrangement,
      panelsTotal,
      rows,
      upsPerFrame,
      framesNeeded: frames,
      materialWastage: wastage,
      widthAllowance: layout.widthAllowance,
      paperSize: layout.paperSize,
      totalMaterialM2: materialM2,
      labelChargerRm: charger,
    };
  });

  return {
    columns,
    layout,
    widthGap,
    heightGap,
    lookupCode,
  };
}

function emptyColumn(quantity: number): ColumnResult {
  return {
    quantity,
    arrangement: '',
    panelsTotal: 0,
    rows: 0,
    upsPerFrame: 0,
    framesNeeded: 0,
    materialWastage: 0,
    widthAllowance: null,
    paperSize: null,
    totalMaterialM2: 0,
    labelChargerRm: null,
  };
}

export function buildLookupCode(
  inputs: Pick<Inputs, 'labelWidth' | 'widthGap' | 'heightGap'> & {
    paperSize?: number;
  },
): string {
  return buildCode(inputs);
}
