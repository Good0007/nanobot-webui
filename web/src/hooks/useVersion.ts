import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useAuthStore } from "../stores/authStore";

export interface PackageVersion {
  current: string;
  latest: string | null;
}

export interface VersionInfo {
  nanobot_webui: PackageVersion;
  nanobot: PackageVersion;
}

export function useVersion() {
  return useQuery<VersionInfo>({
    queryKey: ["system", "version"],
    queryFn: () => api.get("/system/version").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * Stream upgrade progress via SSE.
 * onLine(line, event) is called for each SSE message.
 * Resolves when done, rejects on error.
 */
export async function streamUpdatePackages(
  onLine: (line: string, event: "log" | "done" | "error") => void,
): Promise<void> {
  const token = useAuthStore.getState().token ?? "";
  const baseUrl = api.defaults.baseURL ?? "";
  const resp = await fetch(`${baseUrl}/system/update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(text);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const msg = JSON.parse(line.slice(5).trim()) as { event: string; data: string };
        onLine(msg.data, msg.event as "log" | "done" | "error");
      } catch {
        // ignore malformed lines
      }
    }
  }
}

export function useUpdatePackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (onLine: (line: string, event: "log" | "done" | "error") => void) =>
      streamUpdatePackages(onLine),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system", "version"] });
    },
  });
}
