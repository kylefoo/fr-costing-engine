/**
 * Design-fit deep agent.
 *
 * Uses deepagents + OpenAI vision to decide whether the artwork in a PDF/AI
 * file is fitted to the page edge (no surrounding design specifications that are not part of the artwork).
 *
 * Two tools are available:
 *   analyzeFile       – called when design IS fitted to the edge (Step 2)
 *   reportSkipResult  – called when design is NOT fitted (Step 1B); captures
 *                       the agent's detected artwork dimensions + reasoning
 *
 * Environment variables (server-side only):
 *   OPENAI_API_KEY  – required
 *   OPENAI_MODEL    – optional, defaults to "gpt-4o"
 */

import { createDeepAgent } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from 'langchain';
import { z } from 'zod';
import { analyzeFile } from '@/lib/pdfium/analyzer';
import { getPdfiumLibraryServer } from '@/lib/pdfium/loader';
import type { AnalysisResult, AnalysisIssue } from '@/lib/pdfium/types';

export interface SkipResult {
  /** Agent's explanation of why the design is not fitted to the page edge. */
  reason: string;
  /** Artwork width detected from design notes/labels, in mm. */
  detectedWidthMm?: number;
  /** Artwork height detected from design notes/labels, in mm. */
  detectedHeightMm?: number;
}

const SYSTEM_PROMPT = `You are a label print-production pre-flight agent.

You will receive a rendered image of the first page of a PDF or Illustrator file.

## Step 1 — Fitted to page edge check (REQUIRED before anything else)

Examine the rendered page carefully.

Ask yourself: does the artwork appear to be **fitted to the page edge**?
Look for design elements or colors that are close to the page edges on all sides.
If NO, the design is NOT fitted to the page edge.
Look for dimention notes or label specifications that are not part of the artwork.
If there are present, the design is NOT fitted to the page edge.

- If the design is **NOT fitted** to page edge:
  - Do NOT call the analyzeFile tool.
  - Proceed to Step 1B.

## Step 1B — Report the artwork area

The design is not fitted to the page edge. Look for dimension notes or labels inside
the design (e.g. "105 × 148 mm", "3\" × 4\"", "Width: 90mm Height: 55mm").
Convert any inch values to mm (1 inch = 25.4 mm).

Call the \`reportSkipResult\` tool with:
  - reason: a one-sentence description of what you observed (e.g. "Design is a
    scaled-down thumbnail centred on the page with label specifications that are not part of the artwork.")
  - detectedWidthMm: artwork width in mm if found (number only, no units)
  - detectedHeightMm: artwork height in mm if found (number only, no units)

## Step 2 — Analysis (only when design IS fitted to the edge)

If the artwork fills the page edge (bleeds to or extends beyond it), call the
\`analyzeFile\` tool to run the full technical analysis.

Do not use any other tools. Do not write todos. Do not read or write files.`;

/**
 * Creates a deepagents agent wired to OpenAI vision with two tools.
 * After invoke, call getCapture() for the pdfium result (analyzeFile path)
 * or getSkipResult() for the agent's Step 1B findings (skip path).
 */
export function createDesignFitAgent(buffer: ArrayBuffer) {
  let capturedResult: AnalysisResult | null = null;
  let skipResult: SkipResult | null = null;

  const analyzeFileTool = new DynamicStructuredTool({
    name: 'analyzeFile',
    description:
      'Run full PDF/AI file analysis (PDF box checks, bleed coverage). ' +
      'Call this ONLY when the design is confirmed to reach the page edge without design specifications that are not part of the artwork.',
    schema: z.object({}),
    func: async () => {
      capturedResult = await analyzeFile(buffer, getPdfiumLibraryServer);
      return JSON.stringify({
        pass: capturedResult.pass,
        errors: capturedResult.issues
          .filter((i: AnalysisIssue) => i.severity === 'error')
          .map((i: AnalysisIssue) => i.message),
        warnings: capturedResult.issues
          .filter((i: AnalysisIssue) => i.severity === 'warning')
          .map((i: AnalysisIssue) => i.message),
      });
    },
  });

  const reportSkipResultTool = new DynamicStructuredTool({
    name: 'reportSkipResult',
    description:
      'Report that the design is NOT fitted to the page edge. ' +
      'Call this when white space margins are detected (Step 1B) instead of analyzeFile.',
    schema: z.object({
      reason: z
        .string()
        .describe('One-sentence description of why the design is not fitted to the page edge'),
      detectedWidthMm: z
        .number()
        .optional()
        .describe('Artwork width in mm detected from design notes/labels'),
      detectedHeightMm: z
        .number()
        .optional()
        .describe('Artwork height in mm detected from design notes/labels'),
    }),
    func: async ({ reason, detectedWidthMm, detectedHeightMm }) => {
      skipResult = { reason, detectedWidthMm, detectedHeightMm };
      return JSON.stringify({ recorded: true });
    },
  });

  const model = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL ?? 'gpt-4o',
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const agent = createDeepAgent({
    model,
    tools: [analyzeFileTool, reportSkipResultTool],
    systemPrompt: SYSTEM_PROMPT,
  });

  return {
    agent,
    /** Raw pdfium result captured by analyzeFile tool, or null if not called. */
    getCapture(): AnalysisResult | null {
      return capturedResult;
    },
    /** Agent's Step 1B findings, or null if analyzeFile was called instead. */
    getSkipResult(): SkipResult | null {
      return skipResult;
    },
  };
}
