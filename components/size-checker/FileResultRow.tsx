'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AnalysisCanvas } from './AnalysisCanvas';
import { ResultsPanel } from './ResultsPanel';
import { detectPaperSize, ptToMm } from '@/lib/pdfium/analyzer';
import type { FileEntry } from '@/app/size-checker/page';

interface Props {
  entry: FileEntry;
}

export function FileResultRow({ entry }: Props) {
  const [expanded, setExpanded] = useState(false);

  let paperSize: string | null = null;
  let errorCount = 0;
  let warnCount = 0;

  if (entry.status === 'done') {
    const trim  = entry.result.boxes.find((b) => b.name === 'TrimBox');
    const media = entry.result.boxes.find((b) => b.name === 'MediaBox');
    const sizeBox = trim?.defined ? trim : media;
    paperSize = sizeBox
      ? detectPaperSize(ptToMm(sizeBox.width), ptToMm(sizeBox.height))
      : null;
    errorCount = entry.result.issues.filter((i) => i.severity === 'error').length;
    warnCount  = entry.result.issues.filter((i) => i.severity === 'warning').length;
  }

  const issueLabel =
    errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` :
    warnCount  > 0 ? `${warnCount} warning${warnCount > 1 ? 's' : ''}` :
    null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Row header */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors',
          entry.status === 'done' && 'cursor-pointer hover:bg-muted/30',
        )}
        onClick={() => entry.status === 'done' && setExpanded((v) => !v)}
      >
        {/* Status dot / spinner */}
        <div className="shrink-0 w-5 flex items-center justify-center">
          {entry.status === 'queued' && (
            <div className="size-2 rounded-full bg-muted-foreground/40" />
          )}
          {entry.status === 'loading' && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {entry.status === 'done' && (
            entry.result.pass
              ? <div className="size-2 rounded-full bg-green-500" />
              : <div className="size-2 rounded-full bg-destructive" />
          )}
          {entry.status === 'error' && (
            <AlertCircle className="size-4 text-destructive" />
          )}
        </div>

        {/* Filename */}
        <span className="flex-1 font-mono text-sm text-foreground truncate min-w-0">
          {entry.filename}
        </span>

        {/* Right side: status text or badges */}
        {entry.status === 'loading' && (
          <span className="text-xs text-muted-foreground shrink-0">{entry.label}</span>
        )}

        {entry.status === 'done' && (
          <div className="flex items-center gap-2 shrink-0">
            {paperSize && (
              <Badge variant="default" className="bg-green-600 text-white dark:bg-green-600">
                {paperSize}
              </Badge>
            )}
            {/* <Badge
              variant={entry.result.pass ? 'default' : 'destructive'}
              className={entry.result.pass ? 'bg-green-600 text-white dark:bg-green-600' : undefined}
            >
              {entry.result.pass ? 'PASS' : 'FAIL'}
            </Badge> */}
            {issueLabel && (
              <span className="text-xs text-muted-foreground">{issueLabel}</span>
            )}
          </div>
        )}

        {entry.status === 'error' && (
          <span className="text-xs text-destructive shrink-0">Failed</span>
        )}

        {/* Expand chevron */}
        {entry.status === 'done' && (
          expanded
            ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Error detail */}
      {entry.status === 'error' && (
        <div className="px-4 py-3 border-t border-border bg-destructive/5 text-destructive text-sm">
          {entry.message}
        </div>
      )}

      {/* Expanded analysis detail */}
      {entry.status === 'done' && expanded && (
        <div className="border-t border-border p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <AnalysisCanvas result={entry.result} />
            <ResultsPanel result={entry.result} />
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}
