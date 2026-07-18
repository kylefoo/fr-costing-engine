/** Estimator E9 — frame / printable height (mm). */
export const FRAME_HEIGHT_MM = 980;

/** Estimator E51 — press run-up basis for Material Wastage (mm). */
export const WASTAGE_BASIS_MM = 40_000;

/**
 * Estimator F51 — secondary run-up basis used when deriving the
 * frame-tier quantity for Label Charger pricing (mm).
 */
export const FRAME_TIER_WASTAGE_BASIS_MM = 9_000;

/** Available HP Digital paper widths (mm), largest → smallest. */
export const PAPER_SIZES_MM = [330, 300, 270, 240] as const;

export type PaperSizeMm = (typeof PAPER_SIZES_MM)[number];

/** Default / legacy max paper size. */
export const PAPER_SIZE_MM: PaperSizeMm = 330;

/** Minimum width allowance for stickers (mm). */
export const STICKER_MIN_ALLOWANCE_MM = 15;

/** Minimum width allowance for sachet / shrink sleeve / ticket (mm). */
export const ROLL_PRODUCT_MIN_ALLOWANCE_MM = 10;

/** Roll-form sticker width gap (mm) — fixed. */
export const ROLL_STICKER_WIDTH_GAP_MM = 3;

/** Sheet-form sticker candidate width gaps (mm). */
export const SHEET_STICKER_WIDTH_GAPS_MM = [0, 2] as const;

/** Quantity columns T1–T5 on the Estimator sheet (E7:I7). */
export const QUANTITIES = [1000, 3000, 5000, 10000, 30000] as const;

export type Quantity = (typeof QUANTITIES)[number];
