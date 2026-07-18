'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ColumnResult } from '@/lib/ups-calculator/types';

type ResultsTableProps = {
  columns: ColumnResult[];
};

type RowDef = {
  label: string;
  get: (col: ColumnResult) => string;
};

function formatQtyHeader(qty: number): string {
  if (qty >= 1000) return `${qty / 1000}k`;
  return String(qty);
}

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (digits === 0) return String(Math.round(n));
  return n.toLocaleString('en-MY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

const ROWS: RowDef[] = [
  {
    label: 'Suggested Paper Size (mm)',
    get: (c) => formatNumber(c.paperSize),
  },
  {
    label: 'Material Wastage (pcs)',
    get: (c) => (c.arrangement ? formatNumber(c.materialWastage) : '—'),
  },
  {
    label: 'No. of Panel (x)',
    get: (c) => (c.arrangement ? formatNumber(c.panelsTotal) : '—'),
  },
  {
    label: 'No. of Row (y)',
    get: (c) => (c.arrangement ? formatNumber(c.rows) : '—'),
  },
  {
    label: 'Total No. of Ups per Frame (UPS)',
    get: (c) => (c.arrangement ? formatNumber(c.upsPerFrame) : '—'),
  },
  {
    label: 'No. of Frame',
    get: (c) => (c.arrangement ? formatNumber(c.framesNeeded) : '—'),
  },
  {
    label: 'Width Allowance (mm)',
    get: (c) => formatNumber(c.widthAllowance),
  },
  {
    label: 'TOTAL Material (m²)',
    get: (c) => (c.arrangement ? formatNumber(c.totalMaterialM2) : '—'),
  },
  {
    label: 'Label Charger (RM)',
    get: (c) => formatNumber(c.labelChargerRm, 2),
  },
];

export function ResultsTable({ columns }: ResultsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[220px]">Metric</TableHead>
          {columns.map((col) => (
            <TableHead key={col.quantity} className="text-right tabular-nums">
              {formatQtyHeader(col.quantity)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium text-foreground">{row.label}</TableCell>
            {columns.map((col) => (
              <TableCell
                key={`${row.label}-${col.quantity}`}
                className="text-right tabular-nums text-muted-foreground"
              >
                {row.get(col)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
