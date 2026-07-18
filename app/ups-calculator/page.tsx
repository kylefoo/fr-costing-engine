'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResultsTable } from '@/components/ups-calculator/ResultsTable';
import { SpecForm } from '@/components/ups-calculator/SpecForm';
import { calculateUps } from '@/lib/ups-calculator/calculate';
import {
  ROLL_PRODUCT_MIN_ALLOWANCE_MM,
  STICKER_MIN_ALLOWANCE_MM,
} from '@/lib/ups-calculator/constants';
import type { Inputs } from '@/lib/ups-calculator/types';

const DEFAULT_INPUTS: Inputs = {
  product: 'sticker',
  form: 'roll',
  labelWidth: 39,
  labelHeight: 62,
  widthGap: 3,
  heightGap: 3,
  colors: 4,
};

export default function UpsCalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);

  const result = useMemo(() => calculateUps(inputs), [inputs]);
  const { columns, layout, widthGap, lookupCode } = result;

  const arrangements = columns.map((c) => c.arrangement).filter(Boolean);
  const uniqueArrangements = [...new Set(arrangements)];
  const primaryArrangement = uniqueArrangements[0] ?? '';
  const minAllowance =
    inputs.product === 'sticker'
      ? STICKER_MIN_ALLOWANCE_MM
      : ROLL_PRODUCT_MIN_ALLOWANCE_MM;

  return (
    <main className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Ups Calculator</h1>
        <p className="text-muted-foreground mt-1">
          Choose product and form, enter label specs, and get UPS, paper size,
          and material across quantity tiers.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Label Spec</CardTitle>
            <CardDescription>
              Min width allowance {minAllowance} mm · Frame height 980 mm ·
              Paper options 330 / 300 / 270 / 240 mm
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpecForm value={inputs} onChange={setInputs} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>UPS Calculation</CardTitle>
            <CardDescription>
              {layout ? (
                <>
                  Recommended arrangement:{' '}
                  <span className="font-medium text-foreground">
                    {primaryArrangement.replace('//', ' // ')}
                  </span>
                  {' · '}
                  Paper{' '}
                  <span className="font-medium text-foreground">
                    {layout.paperSize} mm
                  </span>
                  {' · '}
                  Width gap{' '}
                  <span className="font-medium text-foreground">
                    {widthGap} mm
                  </span>
                  {' · '}
                  Allowance{' '}
                  <span className="font-medium text-foreground">
                    {layout.widthAllowance} mm
                  </span>
                  <span className="block mt-1 text-xs">
                    Across-web UPS {layout.acrossUps} · Lookup code {lookupCode}
                  </span>
                </>
              ) : (
                <span className="text-destructive">
                  Label width {inputs.labelWidth} mm cannot fit on available
                  paper sizes with the current gap rules — try a smaller label
                  width.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsTable columns={columns} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
