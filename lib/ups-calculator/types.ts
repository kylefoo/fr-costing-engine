export type ColorCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type QuantityTier = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type ProductType = 'sticker' | 'sachet' | 'shrinksleeve' | 'ticket';

export type FormType = 'roll' | 'sheet';

export type Inputs = {
  product: ProductType;
  /** Only meaningful for sticker; other products are always roll. */
  form: FormType;
  /** Estimator C10 — label width (mm). */
  labelWidth: number;
  /** Estimator E10 — label height (mm). */
  labelHeight: number;
  /**
   * Estimator E12 — width gap (mm). Determined by product/form algorithm;
   * treated as read-only in the UI.
   */
  widthGap: number;
  /** Estimator E13 — height gap (mm). Forced to 0 for non-sticker products. */
  heightGap: number;
  /** Estimator I12 — number of colours (1–8). */
  colors: ColorCount;
};

/** Result of gap + paper-size optimization for across-width UPS. */
export type LayoutOptimization = {
  widthGap: number;
  paperSize: number;
  /** Labels across the web (across-width UPS). */
  acrossUps: number;
  /** Remaining side allowance after packing acrossUps. */
  widthAllowance: number;
  minAllowance: number;
};

export type ColumnResult = {
  quantity: number;
  /** Panel//Section code, e.g. "07//01". */
  arrangement: string;
  /** Row 15 — panels × sections (across-width ups for geometric layout). */
  panelsTotal: number;
  /** Row 16 — rows along the frame height. */
  rows: number;
  /** Row 17 — UPS per frame. */
  upsPerFrame: number;
  /** Row 18 — number of frames needed. */
  framesNeeded: number;
  /** Row 14 — material wastage (pcs). */
  materialWastage: number;
  /** Width allowance (mm). Null when layout is impossible. */
  widthAllowance: number | null;
  /** Suggested paper size (mm) from {330,300,270,240}. */
  paperSize: number | null;
  /** Row 21 — total material (m²). */
  totalMaterialM2: number;
  /** Row 22 — label charger (RM). Null when pricing lookup fails. */
  labelChargerRm: number | null;
};

export type ArrangementRow = {
  code: string;
  labelWidth: number;
  widthGap: number;
  gapType: 'G' | 'S';
  paperMinus10: number;
  arrangements: Record<QuantityTier, string>;
};

export type CostingTierPrices = {
  perFrame1c: number;
  perFrame2c: number;
  perFrame3c: number;
  perFrame4c: number;
  perFrame5c: number;
  perFrame6c: number;
  perFrame7c: number;
  perFrame8c: number;
};
