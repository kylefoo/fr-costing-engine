'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { resolvedGaps } from '@/lib/ups-calculator/optimize';
import type {
  ColorCount,
  FormType,
  Inputs,
  ProductType,
} from '@/lib/ups-calculator/types';

type SpecFormProps = {
  value: Inputs;
  onChange: (next: Inputs) => void;
};

const PRODUCTS: { value: ProductType; label: string }[] = [
  { value: 'sticker', label: 'Sticker' },
  { value: 'sachet', label: 'Sachet' },
  { value: 'shrinksleeve', label: 'Shrink sleeve' },
  { value: 'ticket', label: 'Ticket' },
];

const FORMS: { value: FormType; label: string }[] = [
  { value: 'roll', label: 'Roll form' },
  { value: 'sheet', label: 'Sheet form' },
];

const COLOR_OPTIONS: ColorCount[] = [1, 2, 3, 4, 5, 6, 7, 8];

function parsePositiveNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function SpecForm({ value, onChange }: SpecFormProps) {
  const { widthGap, heightGap } = resolvedGaps(value);
  const isSticker = value.product === 'sticker';
  const showFormStep = isSticker;

  function patch(partial: Partial<Inputs>) {
    const next: Inputs = { ...value, ...partial };

    // Non-sticker products are always roll with 0 mm gaps.
    if (next.product !== 'sticker') {
      next.form = 'roll';
      next.heightGap = 0;
    }

    // Keep widthGap in sync with the optimizer so state stays consistent.
    const gaps = resolvedGaps(next);
    next.widthGap = gaps.widthGap;
    if (next.product !== 'sticker') {
      next.heightGap = 0;
    }

    onChange(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">1. Product</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sachet, shrink sleeve, and ticket are always roll form with 0 mm gap.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRODUCTS.map((p) => (
            <ChoiceButton
              key={p.value}
              selected={value.product === p.value}
              onClick={() => patch({ product: p.value })}
            >
              {p.label}
            </ChoiceButton>
          ))}
        </div>
      </section>

      {showFormStep && (
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">2. Form</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Roll uses a fixed 3 mm width gap. Sheet tries 0 mm and 2 mm and
              picks the gap that maximizes UPS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FORMS.map((f) => (
              <ChoiceButton
                key={f.value}
                selected={value.form === f.value}
                onClick={() => patch({ form: f.value })}
              >
                {f.label}
              </ChoiceButton>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {showFormStep ? '3. Label dimensions' : '2. Label dimensions'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field
            id="label-width"
            label="Label width (mm)"
            value={value.labelWidth}
            onChange={(n) => patch({ labelWidth: n })}
            min={0}
            step="any"
          />
          <Field
            id="label-height"
            label="Label height (mm)"
            value={value.labelHeight}
            onChange={(n) => patch({ labelHeight: n })}
            min={0}
            step="any"
          />
          <Field
            id="width-gap"
            label="Width gap (mm)"
            value={widthGap}
            onChange={() => undefined}
            min={0}
            step="any"
            readOnly
            hint={
              isSticker
                ? value.form === 'sheet'
                  ? 'Optimized (0 or 2 mm)'
                  : 'Fixed 3 mm for roll'
                : 'Fixed 0 mm'
            }
          />
          <Field
            id="height-gap"
            label="Height gap (mm)"
            value={isSticker ? value.heightGap : heightGap}
            onChange={(n) => patch({ heightGap: n })}
            min={0}
            step="any"
            readOnly={!isSticker}
            hint={!isSticker ? 'Fixed 0 mm' : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="colors">Number of colours</Label>
            <select
              id="colors"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={value.colors}
              onChange={(e) =>
                patch({ colors: Number(e.target.value) as ColorCount })
              }
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md text-sm border transition-colors',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50',
      )}
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  min,
  step,
  readOnly,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: string;
  readOnly?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        readOnly={readOnly}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parsePositiveNumber(e.target.value))}
        className={cn(readOnly && 'bg-muted/50 text-muted-foreground')}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
