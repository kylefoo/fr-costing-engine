import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import type { AnalysisResult } from '@/lib/pdfium/types';
import { ptToMm, detectPaperSize } from '@/lib/pdfium/analyzer';

const SEVERITY_CLASS: Record<string, string> = {
  error:   'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info:    'text-muted-foreground',
};

interface Props {
  result: AnalysisResult;
}

export function ResultsPanel({ result }: Props) {
  const { boxes, issues, pass } = result;

  const trim  = boxes.find((b) => b.name === 'TrimBox');
  const media = boxes.find((b) => b.name === 'MediaBox')!;
  const sizeBox = (trim?.defined ? trim : media);
  const paperSize = detectPaperSize(ptToMm(sizeBox.width), ptToMm(sizeBox.height));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Result</h2>
        <Badge
          variant={pass ? 'default' : 'destructive'}
          className={pass ? 'bg-green-600 text-white dark:bg-green-600' : undefined}
        >
          {pass ? 'PASS' : 'FAIL'}
        </Badge>
        {paperSize && (
          <Badge variant="default" className="bg-blue-600 text-white dark:bg-blue-600">
            {paperSize}
          </Badge>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Page Boxes</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Box</TableHead>
              <TableHead>Width</TableHead>
              <TableHead>Height</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boxes.map((box) => (
              <TableRow key={box.name}>
                <TableCell className="font-mono text-sm">{box.name}</TableCell>
                <TableCell>
                  {box.defined ? `${ptToMm(box.width).toFixed(2)} mm` : '—'}
                </TableCell>
                <TableCell>
                  {box.defined ? `${ptToMm(box.height).toFixed(2)} mm` : '—'}
                </TableCell>
                <TableCell>
                  <span className={box.defined ? 'text-foreground' : 'text-muted-foreground'}>
                    {box.defined ? 'Defined' : 'Not defined'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {issues.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Issues</h3>
          <ul className="flex flex-col gap-2">
            {issues.map((issue, i) => (
              <li key={i} className={`text-sm ${SEVERITY_CLASS[issue.severity] ?? ''}`}>
                <span className="font-semibold capitalize">[{issue.severity}]</span>{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No issues found.</p>
      )}
    </div>
  );
}
