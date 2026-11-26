import { useMemo } from "react";
import axios from "axios";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;
export const publicApi = axios.create({ baseURL: API });

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const inst = axios.create({ baseURL: API });
    inst.interceptors.request.use(async (cfg) => {
      const t = await getToken();
      if (t) cfg.headers.Authorization = `Bearer ${t}`;
      return cfg;
    });
    return inst;
  }, [getToken]);
}

export function useMe() {
  const { isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/me")).data,
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });
}

export const errMsg = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
  return fallback;
};

export const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const imgUrl = (u) => (u && u.startsWith("/api/") ? BACKEND_URL + u : u);

export const timeAgo = (iso) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
