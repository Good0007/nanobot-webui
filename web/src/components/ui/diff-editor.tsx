import { useState, useEffect, useRef } from "react";
import { diffLines } from "diff";

interface DiffEditorProps {
  original: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  spellCheck?: boolean;
}

function DiffEditor({ original, value, onChange, className = "", spellCheck = false }: DiffEditorProps) {
  const [lines, setLines] = useState<{ content: string; type: 'added' | 'modified' | 'unchanged' }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 计算差异
  useEffect(() => {
    const diffResult = diffLines(original, value, { ignoreWhitespace: false });
    const result: { content: string; type: 'added' | 'modified' | 'unchanged' }[] = [];
    let removedLines: string[] = [];

    diffResult.forEach(part => {
      const partLines = part.value.split('\n');
      // 移除最后一个空行（因为split('\n')会在末尾添加一个空字符串）
      if (partLines.length > 0 && partLines[partLines.length - 1] === '') {
        partLines.pop();
      }

      if (part.removed) {
        // 保存删除的行，用于检测修改
        removedLines = partLines;
      } else if (part.added) {
        // 检查是否是修改（删除后立即添加）
        if (removedLines.length > 0) {
          // 标记为修改的行
          partLines.forEach(line => {
            result.push({ content: line, type: 'modified' });
          });
          removedLines = []; // 清空已处理的删除行
        } else {
          // 标记为新增的行
          partLines.forEach(line => {
            result.push({ content: line, type: 'added' });
          });
        }
      } else {
        // 未修改的行
        partLines.forEach(line => {
          result.push({ content: line, type: 'unchanged' });
        });
        removedLines = []; // 清空删除行，因为遇到了未修改的行
      }
    });

    setLines(result);
  }, [original, value]);

  // 同步滚动
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const syncScroll = () => {
      const overlay = document.getElementById('diff-overlay');
      if (overlay) {
        overlay.scrollTop = textarea.scrollTop;
        overlay.scrollLeft = textarea.scrollLeft;
      }
    };

    textarea.addEventListener('scroll', syncScroll);
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, []);

  return (
    <div className="relative font-mono text-xs">
      {/* 差异高亮覆盖层 */}
      <div 
        id="diff-overlay"
        className="absolute inset-0 pointer-events-none overflow-auto"
        style={{
          padding: '10px',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.5',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: 'transparent', // 隐藏覆盖层的文本
        }}
      >
        {lines.map((line, index) => (
          <div 
            key={index}
            className={`min-h-[18px] ${line.type === 'added' ? 'bg-green-100' : line.type === 'modified' ? 'bg-red-100' : ''}`}
          >
            {line.content}
          </div>
        ))}
      </div>

      {/* 实际的文本编辑器 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-h-[520px] resize-y leading-relaxed ${className}`}
        spellCheck={spellCheck}
        style={{
          backgroundColor: 'transparent',
          caretColor: 'currentColor',
          position: 'relative',
          zIndex: 1,
          lineHeight: '1.5',
          padding: '10px',
        }}
      />
    </div>
  );
}

export { DiffEditor };