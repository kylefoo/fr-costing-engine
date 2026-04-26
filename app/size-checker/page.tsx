'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FileDropZone } from '@/components/size-checker/FileDropZone';
import { AnalysisCanvas } from '@/components/size-checker/AnalysisCanvas';
import { ResultsPanel } from '@/components/size-checker/ResultsPanel';
import { analyzeFile } from '@/lib/pdfium/analyzer';
import type { AnalysisResult } from '@/lib/pdfium/types';

type PageState =
  | { status: 'idle' }
  | { status: 'loading'; label: string }
  | { status: 'done'; result: AnalysisResult; filename: string }
  | { status: 'error'; message: string };

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/wasm|fetch|network/i.test(msg)) {
    return 'Analysis engine failed to load. Check your connection and try again.';
  }
  if (/password|encrypt/i.test(msg)) {
    return 'This file is password-protected and cannot be analyzed.';
  }
  if (/invalid|parse|unexpected|corrupt/i.test(msg)) {
    return 'Could not parse file. Is this a valid PDF or Illustrator file? Old .ai files without an embedded PDF are not supported — export as PDF first.';
  }
  return `Analysis failed: ${msg}`;
}

export default function SizeCheckerPage() {
  const [state, setState] = useState<PageState>({ status: 'idle' });

  async function handleFile(buffer: ArrayBuffer, filename: string) {
    try {
      // Phase 1: warm up pdfium (triggers WASM download on first use)
      setState({ status: 'loading', label: 'Loading analysis engine…' });
      const { getPdfiumLibrary } = await import('@/lib/pdfium/loader');
      await getPdfiumLibrary();

      // Phase 2: run analysis
      setState({ status: 'loading', label: 'Analyzing file…' });
      const result = await analyzeFile(buffer);

      setState({ status: 'done', result, filename });
    } catch (err) {
      setState({ status: 'error', message: classifyError(err) });
    }
  }

  return (
    <main className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Size Checker</h1>
        <p className="text-muted-foreground mt-1">
          Upload a PDF or Illustrator file to verify its page boxes are correct for print production.
        </p>
      </div>

      <FileDropZone
        onFile={handleFile}
        onError={(message) => setState({ status: 'error', message })}
        disabled={state.status === 'loading'}
      />

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 mt-6 text-muted-foreground">
          <Loader2 className="animate-spin size-4" />
          <span className="text-sm">{state.label}</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {state.message}
        </div>
      )}

      {state.status === 'done' && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            File: <span className="font-medium text-foreground">{state.filename}</span>
            {' · '}
            <button
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => setState({ status: 'idle' })}
            >
              Upload another file
            </button>
          </p>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <AnalysisCanvas result={state.result} />
            <ResultsPanel result={state.result} />
          </div>
        </>
      )}
    </main>
  );
}
