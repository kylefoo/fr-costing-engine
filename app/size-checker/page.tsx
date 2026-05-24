'use client';

import { useState, useRef, useCallback } from 'react';
import { FileDropZone } from '@/components/size-checker/FileDropZone';
import { FileResultRow } from '@/components/size-checker/FileResultRow';
import type { AnalysisResult } from '@/lib/pdfium/types';
import type { FilePayload } from '@/components/size-checker/FileDropZone';

export type FileEntry =
  | { id: string; filename: string; status: 'queued' }
  | { id: string; filename: string; status: 'loading'; label: string }
  | { id: string; filename: string; status: 'done'; result: AnalysisResult }
  | { id: string; filename: string; status: 'error'; message: string };

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/password|encrypt/i.test(msg)) {
    return 'This file is password-protected and cannot be analyzed.';
  }
  if (/invalid|parse|unexpected|corrupt/i.test(msg)) {
    return 'Could not parse file. Is this a valid PDF or Illustrator file? Old .ai files without an embedded PDF are not supported — export as PDF first.';
  }
  return `Analysis failed: ${msg}`;
}

export default function SizeCheckerPage() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dropError, setDropError] = useState<string | null>(null);

  // Queue holds buffers (not kept in React state to avoid re-render cost)
  const queueRef = useRef<Array<{ id: string; buffer: ArrayBuffer; filename: string }>>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;

      setEntries((prev) => prev.map((e) =>
        e.id === item.id
          ? { id: e.id, filename: e.filename, status: 'loading', label: 'Checking design fit…' }
          : e,
      ));

      try {
        const formData = new FormData();
        formData.append('file', new Blob([item.buffer]), item.filename);

        setEntries((prev) => prev.map((e) =>
          e.id === item.id
            ? { id: e.id, filename: e.filename, status: 'loading', label: 'Analyzing file…' }
            : e,
        ));

        const response = await fetch('/api/analyze-fit', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Server error ${response.status}`);
        }

        const result = await response.json() as AnalysisResult;

        setEntries((prev) => prev.map((e) =>
          e.id === item.id
            ? { id: e.id, filename: e.filename, status: 'done', result }
            : e,
        ));
      } catch (err) {
        setEntries((prev) => prev.map((e) =>
          e.id === item.id
            ? { id: e.id, filename: e.filename, status: 'error', message: classifyError(err) }
            : e,
        ));
      }
    }

    processingRef.current = false;
  }, []);

  function handleFiles(files: FilePayload[]) {
    setDropError(null);
    const newEntries: FileEntry[] = files.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.filename,
      status: 'queued',
    }));

    setEntries((prev) => [...prev, ...newEntries]);

    files.forEach((f, i) => {
      queueRef.current.push({ id: newEntries[i].id, buffer: f.buffer, filename: f.filename });
    });

    processQueue();
  }

  const isProcessing = entries.some((e) => e.status === 'queued' || e.status === 'loading');
  const doneCount = entries.filter((e) => e.status === 'done').length;
  const passCount = entries.filter((e) => e.status === 'done' && (e as Extract<FileEntry, { status: 'done' }>).result.pass).length;

  return (
    <main className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Size Checker</h1>
        <p className="text-muted-foreground mt-1">
          Upload PDF or Illustrator files to verify their page boxes are correct for print production.
        </p>
      </div>

      <FileDropZone
        onFiles={handleFiles}
        onError={(msg) => setDropError(msg)}
      />

      {dropError && (
        <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {dropError}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {entries.length} file{entries.length !== 1 ? 's' : ''}
              {isProcessing && ' · Analyzing…'}
              {!isProcessing && doneCount > 0 && (
                <> · <span className="text-green-600 dark:text-green-400">{passCount} analyzed</span>
                {passCount < doneCount && <>, <span className="text-destructive">{doneCount - passCount} failed</span></>}</>
              )}
            </span>
            <button
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setEntries([])}
              disabled={isProcessing}
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <FileResultRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
