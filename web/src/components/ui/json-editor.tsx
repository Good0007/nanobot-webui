import { useMemo, useCallback, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { useTheme } from "next-themes";

// ── inline line diff (no external deps) ──────────────────────────────────────

function computeLineDiff(
  original: string,
  current: string,
): { added: Set<number>; modified: Set<number> } {
  const added = new Set<number>();
  const modified = new Set<number>();
  if (!original || original === current) return { added, modified };

  const aLines = original.split("\n");
  const bLines = current.split("\n");
  const n = aLines.length;
  const m = bLines.length;
  if (n > 2000 || m > 2000) return { added, modified }; // skip huge files

  // LCS DP
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        aLines[i - 1] === bLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Trace back edit script
  const ops: Array<{ type: "keep" | "del" | "ins"; bIdx?: number }> = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      ops.push({ type: "keep" }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "ins", bIdx: j - 1 }); j--;
    } else {
      ops.push({ type: "del" }); i--;
    }
  }
  ops.reverse();

  // Pair deletions with insertions → "modified"; lone insertions → "added"
  let pendingDels = 0;
  const pendingIns: number[] = [];
  const flush = () => {
    const pairs = Math.min(pendingDels, pendingIns.length);
    pendingIns.forEach((bIdx, k) => {
      (k < pairs ? modified : added).add(bIdx + 1); // 1-based line number
    });
    pendingDels = 0;
    pendingIns.length = 0;
  };
  for (const op of ops) {
    if (op.type === "del") { pendingDels++; }
    else if (op.type === "ins") { pendingIns.push(op.bIdx!); }
    else { flush(); }
  }
  flush();
  return { added, modified };
}

// ── diff decoration ───────────────────────────────────────────────────────────

const addedMark    = Decoration.line({ attributes: { class: "cm-diff-added" } });
const modifiedMark = Decoration.line({ attributes: { class: "cm-diff-modified" } });
const setDiffEffect = StateEffect.define<{ added: Set<number>; modified: Set<number> }>();

const diffField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDiffEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        const { added, modified } = effect.value;
        for (let ln = 1; ln <= tr.state.doc.lines; ln++) {
          const line = tr.state.doc.line(ln);
          if (modified.has(ln)) builder.add(line.from, line.from, modifiedMark);
          else if (added.has(ln)) builder.add(line.from, line.from, addedMark);
        }
        decorations = builder.finish();
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── themes ────────────────────────────────────────────────────────────────────

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit" },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted) / 0.4)",
    borderRight: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--muted) / 0.3)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "hsl(var(--primary) / 0.2)" },
  ".cm-diff-added":    { background: "oklch(0.88 0.09 144 / 0.35)" },
  ".cm-diff-modified": { background: "oklch(0.88 0.09 25 / 0.35)" },
});

const darkDiffTheme = EditorView.theme({
  ".cm-diff-added":    { background: "oklch(0.35 0.1 144 / 0.4)" },
  ".cm-diff-modified": { background: "oklch(0.35 0.1 25 / 0.4)" },
}, { dark: true });

// ── component ────────────────────────────────────────────────────────────────

interface JsonEditorProps {
  value: string;
  original?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  className?: string;
}

export function JsonEditor({
  value,
  original = "",
  onChange,
  readOnly = false,
  height = "calc(100dvh - 160px)",
  className = "",
}: JsonEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const viewRef = useRef<EditorView | null>(null);

  const diffInfo = useMemo(() => computeLineDiff(original, value), [original, value]);

  // Push diff decorations into the editor whenever diffInfo changes
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setDiffEffect.of(diffInfo) });
  }, [diffInfo]);

  const extensions = useMemo(() => [
    json(),
    diffField,
    EditorView.lineWrapping,
    isDark ? darkDiffTheme : lightTheme,
  ], [isDark]);

  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  const handleChange = useCallback((val: string) => onChange?.(val), [onChange]);

  return (
    <CodeMirror
      value={value}
      extensions={extensions}
      theme={isDark ? oneDark : "light"}
      onChange={handleChange}
      readOnly={readOnly}
      onCreateEditor={onCreateEditor}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: false,
        bracketMatching: true,
        indentOnInput: true,
        tabSize: 2,
      }}
      className={className}
      height={height}
      style={{ fontSize: 12 }}
    />
  );
}
