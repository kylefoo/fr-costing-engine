/**
 * POST /api/analyze-fit
 *
 * Accepts a PDF or Illustrator file as multipart FormData and runs the
 * design-fit deep agent:
 *
 *  1. Renders page 0 server-side via pdfium → BGRA bitmap
 *  2. Encodes it as a PNG data URL for the DeepSeek vision check
 *  3. Invokes the deepagents agent; the agent either calls `analyzeFile`
 *     (design fits edge) or skips it (design not fitted to page edge)
 *  4. Returns a serialised AnalysisResult; `rendered.dataUrl` carries the
 *     PNG so the client can display the page without re-rendering
 *
 * Required env var: OPENAI_API_KEY
 * Optional env var: OPENAI_MODEL (default: gpt-4o)
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from 'langchain';
import { PNG } from 'pngjs';
import { getPdfiumLibraryServer } from '@/lib/pdfium/loader';
import { createDesignFitAgent } from '@/lib/ai/designFitAgent';
import type { AnalysisResult, BoxInfo, BoxName } from '@/lib/pdfium/types';

/** 1 mm expressed in PDF user-space points (72 pt/inch, 25.4 mm/inch). */
const MM_TO_PT = 72 / 25.4;

const RENDER_SCALE = 150 / 72; // 150 DPI

/** Convert a BGRA Uint8Array to a base64 PNG data URL using pngjs. */
function bgraToDataUrl(bgra: Uint8Array, width: number, height: number): string {
  const png = new PNG({ width, height });
  // pngjs data buffer is pre-allocated to width * height * 4 bytes (RGBA)
  for (let i = 0; i < bgra.length; i += 4) {
    png.data[i + 0] = bgra[i + 2]; // R  (source is B-G-R-A)
    png.data[i + 1] = bgra[i + 1]; // G
    png.data[i + 2] = bgra[i + 0]; // B
    png.data[i + 3] = bgra[i + 3]; // A
  }
  const pngBuffer = PNG.sync.write(png);
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

/**
 * Serialise an AnalysisResult for JSON transport.
 * Strips the raw BGRA Uint8Array from `rendered.data` — the client receives
 * `rendered.dataUrl` (a base64 PNG) instead.
 */
function serializeResult(result: AnalysisResult): Record<string, unknown> {
  return {
    ...result,
    rendered: {
      dataUrl: result.rendered.dataUrl,
      width: result.rendered.width,
      height: result.rendered.height,
      scale: result.rendered.scale,
    },
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  let buffer: ArrayBuffer;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    buffer = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file.' }, { status: 400 });
  }

  // Step 1: render page 0 server-side for the vision check
  let dataUrl: string;
  let renderWidth: number;
  let renderHeight: number;
  try {
    const library = await getPdfiumLibraryServer();
    const doc = await library.loadDocument(new Uint8Array(buffer));
    const page = doc.getPage(0);
    let renderResult: Awaited<ReturnType<typeof page.render>>;
    try {
      renderResult = await page.render({ scale: RENDER_SCALE, render: 'bitmap' });
    } finally {
      doc.destroy();
    }
    dataUrl = bgraToDataUrl(renderResult.data, renderResult.width, renderResult.height);
    renderWidth = renderResult.width;
    renderHeight = renderResult.height;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to render file: ${msg}` }, { status: 422 });
  }

  // Step 2: run the deep agent.
  // If the agent calls analyzeFile the result is captured via closure.
  // If it detects design is not fitted to page edge, it skips the tool — capture stays null.
  const { agent, getCapture, getSkipResult } = createDesignFitAgent(buffer);

  try {
    await agent.invoke({
      messages: [
        new HumanMessage({
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
            {
              type: 'text',
              text:
                'This is a rendered image of the first page of a PDF/AI print file. ' +
                'Follow your instructions: check design is fitted to page edge, then ' +
                'call analyzeFile if the design is fitted to the page edge. Else, skip ' +
                'analyzeFile and scan the design specification for width and height of the artwork area.',
            },
          ],
        }),
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Agent invocation failed: ${msg}` }, { status: 502 });
  }

  // Step 3: build the AnalysisResult.
  // • analyzeFile called → use captured pdfium result; analyzeFileSkipped = false
  // • reportSkipResult called → design not fitted; build result from agent's Step 1B findings
  const capture = getCapture();
  const skipResult = getSkipResult();

  let result: AnalysisResult;

  if (capture) {
    result = {
      ...capture,
      rendered: {
        dataUrl,
        width: capture.rendered.width,
        height: capture.rendered.height,
        scale: capture.rendered.scale,
      },
      analyzeFileSkipped: false,
    };
  } else {
    // Build a synthetic MediaBox from the agent's detected dimensions (mm → PDF points)
    const boxes: BoxInfo[] =
      skipResult?.detectedWidthMm && skipResult?.detectedHeightMm
        ? [
            {
              name: 'MediaBox' as BoxName,
              defined: true,
              x: 0,
              y: 0,
              width: skipResult.detectedWidthMm * MM_TO_PT,
              height: skipResult.detectedHeightMm * MM_TO_PT,
            },
          ]
        : [];

    result = {
      boxes,
      issues: [
        {
          severity: 'error',
          message: skipResult?.reason ?? 'The design is NOT fitted to the page edge',
        },
      ],
      rendered: {
        dataUrl,
        width: renderWidth,
        height: renderHeight,
        scale: RENDER_SCALE,
      },
      pass: false,
      analyzeFileSkipped: true,
    };
  }

  return NextResponse.json(serializeResult(result));
}
