import { useState, useEffect, useRef } from "react";
import { diffLines } from "diff";

interface DiffEditorProps {
  original: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  spellCheck?: boolean;
}

const GUTTER_W = 48; // px — line-number column width
const PAD = 10;       // px — editor content padding
const LINE_H = 18;    // px — font 12px × line-height 1.5

function DiffEditor({ original, value, onChange, className = "", spellCheck = false }: DiffEditorProps) {
  const [lineDiffs, setLineDiffs] = useState<{ content: string; type: 'added' | 'modified' | 'unchanged' }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef  = useRef<HTMLDivElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  const lineCount = value ? value.split('\n').length : 1;
  const hasError  = className.includes('border-destructive');

  // 计算差异
  useEffect(() => {
    const diffResult = diffLines(original, value, { ignoreWhitespace: false });
    const result: { content: string; type: 'added' | 'modified' | 'unchanged' }[] = [];
    let removedLines: string[] = [];

    diffResult.forEach(part => {
      const partLines = part.value.split('\n');
      if (partLines.length > 0 && partLines[partLines.length - 1] === '') {
        partLines.pop();
      }
      if (part.removed) {
        removedLines = partLines;
      } else if (part.added) {
        if (removedLines.length > 0) {
          partLines.forEach(line => result.push({ content: line, type: 'modified' }));
          removedLines = [];
        } else {
          partLines.forEach(line => result.push({ content: line, type: 'added' }));
        }
      } else {
        partLines.forEach(line => result.push({ content: line, type: 'unchanged' }));
        removedLines = [];
      }
    });

    setLineDiffs(result);
  }, [original, value]);

  // 同步滚动：textarea → 行号列 + 差异覆盖层
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const syncScroll = () => {
      if (overlayRef.current) {
        overlayRef.current.scrollTop  = ta.scrollTop;
        overlayRef.current.scrollLeft = ta.scrollLeft;
      }
      if (lineNumRef.current) {
        lineNumRef.current.scrollTop = ta.scrollTop;
      }
    };

    ta.addEventListener('scroll', syncScroll);
    return () => ta.removeEventListener('scroll', syncScroll);
  }, []);

  return (
    <div
      className={`flex rounded-md border font-mono text-xs ${hasError ? 'border-destructive' : 'border-input'}`}
      style={{ minHeight: 520, resize: 'vertical', overflow: 'hidden' }}
    >
      {/* 行号列 */}
      <div
        ref={lineNumRef}
        className="select-none flex-shrink-0 bg-muted/40 border-r border-border text-muted-foreground"
        style={{
          width: GUTTER_W,
          paddingTop: PAD,
          paddingRight: 8,
          paddingBottom: PAD,
          fontSize: 12,
          lineHeight: 1.5,
          textAlign: 'right',
          overflowY: 'hidden',
          overflowX: 'hidden',
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} style={{ height: LINE_H }}>{i + 1}</div>
        ))}
      </div>

      {/* 编辑区域 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 差异高亮覆盖层 */}
        <div
          ref={overlayRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            overflow: 'hidden',
            padding: PAD,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
            fontFamily: 'monospace',
            fontSize: 12,
            color: 'transparent',
          }}
        >
          {lineDiffs.map((line, i) => (
            <div
              key={i}
              className={
                line.type === 'added'    ? 'bg-green-100 dark:bg-green-900/30' :
                line.type === 'modified' ? 'bg-red-100 dark:bg-red-900/30'     : ''
              }
              style={{ minHeight: LINE_H }}
            >
              {line.content}
            </div>
          ))}
        </div>

        {/* 文本编辑器 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={spellCheck}
          className="w-full h-full bg-transparent focus:outline-none"
          style={{
            resize: 'none',
            minHeight: 520,
            padding: PAD,
            lineHeight: 1.5,
            fontSize: 12,
            position: 'relative',
            zIndex: 1,
            color: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

export { DiffEditor };