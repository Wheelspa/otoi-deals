import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BACKEND_URL, publicApi } from "@/lib/api";

const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";

export function useLiveSync() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let ws, retry, closed = false;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onmessage = () => qc.invalidateQueries({ queryKey: ["deal"] });
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    const ping = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [qc]);
  return connected;
}

export function useDeal() {
  return useQuery({
    queryKey: ["deal"],
    queryFn: async () => (await publicApi.get("/deal/current")).data,
    refetchInterval: 10000,
    staleTime: 0,
  });
}

export function useCountdown(target) {
  const [nowTs, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const ms = Math.max(0, new Date(target).getTime() - nowTs);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { ms, d, h, m, s: sec, label: `${d ? d + "d " : ""}${pad(h)}:${pad(m)}:${pad(sec)}`, short: `${pad(m)}:${pad(sec)}` };
}
