import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../lib/api";
import i18n from "../i18n";

export interface ChannelStatus {
  name: string;
  enabled: boolean;
  running: boolean;
  error: string | null;
  config: Record<string, unknown>;
}

export interface WeixinQrStartData {
  qrcode_id: string;
  qr_image: string;
  scan_url: string;
}

export interface WeixinQrStatusData {
  status: "wait" | "scaned" | "confirmed" | "expired";
}

export function useChannels() {
  return useQuery<ChannelStatus[]>({
    queryKey: ["channels"],
    queryFn: () => api.get("/channels").then((r) => r.data),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Record<string, unknown> }) =>
      api.patch(`/channels/${name}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success(i18n.t("channels.saved"));
    },
  });
}

export function useReloadChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post(`/channels/${name}/reload`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success(i18n.t("channels.reloaded"));
    },
  });
}

export function useReloadAllChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/channels/reload-all").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success(i18n.t("channels.reloadedAll"));
    },
  });
}

export function useToggleChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.patch(`/channels/${name}`, { enabled }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useWeixinQrStart() {
  return useMutation<WeixinQrStartData>({
    mutationFn: () => api.post("/channels/weixin/qr/start").then((r) => r.data),
  });
}

export function useWeixinQrStatus(qrcodeId: string | null) {
  return useQuery<WeixinQrStatusData>({
    queryKey: ["weixin-qr-status", qrcodeId],
    queryFn: () =>
      api.get(`/channels/weixin/qr/status?qrcode_id=${qrcodeId}`).then((r) => r.data),
    enabled: !!qrcodeId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === "confirmed" || s === "expired") return false;
      return 2000;
    },
  });
}
