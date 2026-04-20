import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

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

export function useUpdatePackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post("/system/update", undefined, { timeout: 300_000 }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system", "version"] });
    },
  });
}
