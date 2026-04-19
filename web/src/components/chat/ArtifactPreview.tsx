import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/utils";
import api from "../../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileCategory = "html" | "image" | "video" | "markdown" | "text" | "other";

function getFileCategory(filePath: string): FileCategory {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (["html", "htm"].includes(ext)) return "html";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if ([
    "txt", "log", "csv", "xml", "yaml", "yml", "toml", "ini", "env",
    "json", "jsonl", "json5",
    "py", "js", "ts", "jsx", "tsx", "css", "scss", "sh", "bash",
    "rs", "go", "java", "c", "cpp", "h", "sql",
  ].includes(ext)) return "text";
  return "other";
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Map extension → highlight.js language hint. */
function getLangHint(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const MAP: Record<string, string> = {
    json: "json", jsonl: "json", json5: "json",
    js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
    py: "python", sh: "bash", bash: "bash",
    css: "css", scss: "scss", xml: "xml",
    yaml: "yaml", yml: "yaml", toml: "toml",
    sql: "sql", rs: "rust", go: "go",
    java: "java", c: "c", cpp: "cpp",
  };
  return MAP[ext] ?? "";
}

/** Pretty-print JSON if the file is a JSON variant and content is valid JSON. */
function maybeFormatJson(content: string, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json" || ext === "json5") {
    try { return JSON.stringify(JSON.parse(content), null, 2); } catch { /* ignore */ }
  }
  return content;
}

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ className?: string }>> = {
  html: FileCode,
  image: FileImage,
  video: FileVideo,
  markdown: FileText,
  text: FileCode,
  other: FileText,
};

const CATEGORY_LABEL: Record<FileCategory, string> = {
  html: "HTML",
  image: "Image",
  video: "Video",
  markdown: "Markdown",
  text: "Text",
  other: "File",
};

// ---------------------------------------------------------------------------
// ArtifactPreview
// ---------------------------------------------------------------------------

interface ArtifactPreviewProps {
  filePath: string;
}

export function ArtifactPreview({ filePath }: ArtifactPreviewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Text content for HTML / markdown rendering
  const [textContent, setTextContent] = useState<string | null>(null);
  // Object URL for image / video
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const category = getFileCategory(filePath);
  const fileName = getFileName(filePath);
  const Icon = CATEGORY_ICON[category];

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      if (category === "html" || category === "markdown" || category === "text") {
        const resp = await api.get<string>("/workspace/file", {
          params: { path: filePath },
          responseType: "text",
        });
        setTextContent(resp.data);
      } else {
        const resp = await api.get<Blob>("/workspace/file", {
          params: { path: filePath },
          responseType: "blob",
        });
        const url = URL.createObjectURL(resp.data);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = url;
        setBlobUrl(url);
      }
    } catch {
      setError(t("chat.artifact.loadError"));
    } finally {
      setLoading(false);
    }
  };

  // Download: always available — fetches blob independently so no need to expand first.
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const resp = await api.get<Blob>("/workspace/file", {
        params: { path: filePath },
        responseType: "blob",
      });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  // Open HTML in new tab — only after textContent is loaded; build blob on demand.
  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!textContent) return;
    const blob = new Blob([textContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // revoke after a short delay so the new tab can read it
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // Revoke blob URL on unmount to avoid memory leak
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  // Load content when expanding for the first time
  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !textContent && !blobUrl && !loading) {
      fetchContent();
    }
  };

  return (
    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-800/40 dark:bg-emerald-950/15 text-xs overflow-hidden">
      {/* Header row */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
      >
        <Icon className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-mono font-medium text-emerald-700 dark:text-emerald-300 truncate flex-1">
          {fileName}
        </span>
        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
          {CATEGORY_LABEL[category]}
        </span>

        {/* Open in new tab — only for HTML, only after content loaded */}
        {category === "html" && textContent !== null && (
          <span
            role="button"
            onClick={handleOpenExternal}
            className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
            aria-label={t("chat.artifact.openExternal")}
          >
            <ExternalLink className="h-3 w-3" />
          </span>
        )}

        {/* Download — always available, no expand required */}
        <span
          role="button"
          onClick={handleDownload}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
          aria-label={t("chat.artifact.download")}
        >
          <Download className="h-3 w-3" />
        </span>

        {loading ? (
          <RefreshCw className="h-3 w-3 shrink-0 text-emerald-500 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>

      {/* Preview content */}
      {expanded && (
        <div className="border-t border-emerald-200/40 dark:border-emerald-800/30">
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground/60">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              <span>{t("chat.artifact.loading")}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-red-500/80">{error}</span>
              <button
                onClick={fetchContent}
                className="flex items-center gap-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t("chat.artifact.retry")}</span>
              </button>
            </div>
          )}

          {!loading && !error && category === "html" && textContent !== null && (
            <iframe
              srcDoc={textContent}
              sandbox="allow-scripts"
              className="w-full h-[480px] bg-white"
              title={fileName}
            />
          )}

          {!loading && !error && category === "markdown" && textContent !== null && (
            <div className={cn(
              "px-4 py-3 prose prose-sm max-w-none dark:prose-invert",
              "[&_pre]:rounded-xl [&_pre]:bg-zinc-100 dark:[&_pre]:bg-zinc-900 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:overflow-x-auto",
              "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-xs",
            )}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {textContent}
              </ReactMarkdown>
            </div>
          )}

          {!loading && !error && category === "image" && blobUrl !== null && (
            <div className="flex justify-center p-3">
              <img
                src={blobUrl}
                alt={fileName}
                className="max-w-full max-h-[480px] rounded object-contain"
              />
            </div>
          )}

          {!loading && !error && category === "video" && blobUrl !== null && (
            <div className="p-3">
              <video
                controls
                src={blobUrl}
                className="w-full max-h-[480px] rounded"
              />
            </div>
          )}

          {!loading && !error && category === "text" && textContent !== null && (
            <pre className={cn(
              "max-h-[480px] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed",
              "text-foreground/80 bg-zinc-50 dark:bg-zinc-900",
              `language-${getLangHint(filePath)}`,
            )}>
              {maybeFormatJson(textContent, filePath)}
            </pre>
          )}

          {!loading && !error && category === "other" && (
            <div className="px-3 py-2 text-muted-foreground/70">
              {t("chat.artifact.unsupported")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: extract write_file path from a tool call input string
// ---------------------------------------------------------------------------

export function extractWriteFilePath(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as { path?: unknown };
    return typeof parsed.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
}
