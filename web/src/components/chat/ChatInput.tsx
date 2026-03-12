import { useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Wifi, WifiOff, Paperclip, X, Loader2, ImageIcon, FileText, Terminal } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";
import { uploadFile } from "../../hooks/useConfig";

interface Attachment {
  id: string;
  name: string;
  url?: string;
  uploading: boolean;
}

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  onStop?: () => void;
  isWaiting?: boolean;
  isConnected?: boolean;
  showToolMessages?: boolean;
  onToggleToolMessages?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  onStop,
  isWaiting,
  isConnected = true,
  showToolMessages = false,
  onToggleToolMessages,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      const id = nanoid();
      setAttachments((prev) => [...prev, { id, name: file.name, uploading: true }]);
      try {
        const url = await uploadFile(file);
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, url, uploading: false } : a))
        );
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error(detail ?? t("chat.uploadFailed"));
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }
    }
  }, [t]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const fileItems = Array.from(e.clipboardData.items).filter((i) => i.kind === "file");
      if (fileItems.length === 0) return;
      e.preventDefault();
      const files = fileItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
      handleFilesSelected(files);
    },
    [handleFilesSelected]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isUploading = attachments.some((a) => a.uploading);

  const handleSend = useCallback(() => {
    const text = value.trim();
    const readyAttachments = attachments.filter((a) => a.url && !a.uploading);
    if ((!text && readyAttachments.length === 0) || disabled || isUploading) return;

    let content = text;
    for (const att of readyAttachments) {
      if (att.url) {
        const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name);
        content += `\n${isImage ? `![${att.name}](${att.url})` : `[${att.name}](${att.url})`}`;
      }
    }

    onSend(content.trim());
    setValue("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, disabled, isUploading, onSend]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const canSend = (value.trim().length > 0 || attachments.filter((a) => a.url).length > 0) && !isUploading;

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full px-4 py-3">
        <div className={cn(
          "relative flex flex-col rounded-2xl border bg-background shadow-sm transition-all",
          isWaiting ? "border-primary/40" : "focus-within:border-primary/60 focus-within:shadow-md"
        )}>
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {attachments.map((att) => {
                const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name);
                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-1.5 rounded-lg border bg-muted/60 px-2.5 py-1 text-xs"
                  >
                    {att.uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : isImage ? (
                      <ImageIcon className="h-3 w-3 text-primary" />
                    ) : (
                      <FileText className="h-3 w-3 text-primary" />
                    )}
                    <span className="max-w-[140px] truncate text-muted-foreground">
                      {att.uploading ? t("chat.uploading") : att.name}
                    </span>
                    {!att.uploading && (
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t("chat.placeholder")}
            rows={1}
            className="min-h-[52px] max-h-[160px] flex-1 resize-none border-0 bg-transparent px-4 py-3.5 shadow-none focus-visible:ring-0 text-sm leading-relaxed"
            disabled={!isWaiting && disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isConnected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-destructive" />
              )}
              <span>{isConnected ? t("chat.connected") : t("chat.disconnected")}</span>

              {/* File upload button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={isWaiting}
                title={t("chat.uploadAttachment")}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
              {/* Toggle tool messages */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 transition-colors ${
                  showToolMessages
                    ? "text-primary"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                }`}
                onClick={onToggleToolMessages}
                title={showToolMessages ? t("chat.hideToolMessages") : t("chat.showToolMessages")}
              >
                <Terminal className="h-3.5 w-3.5" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isWaiting ? "" : t("chat.hint")}
              </span>
              {isWaiting ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onStop}
                  className="h-8 gap-1.5 rounded-xl px-3"
                >
                  <Square className="h-3.5 w-3.5" />
                  {t("chat.stop")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!canSend || disabled}
                  className="h-8 gap-1.5 rounded-xl px-3"
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("chat.send")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
