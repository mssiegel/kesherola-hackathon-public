// Live session state: seed from the WS snapshot (and a REST fallback), then
// merge every session.updated push from the backend. Reconnects on drop.
import { useEffect, useRef, useState } from "react";
import type { Session } from "@shared/types";
import { getSessions } from "./api";

type WsMessage =
  | { kind: "snapshot"; sessions: Session[] }
  | { kind: "session"; session: Session };

export function useLiveSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connected, setConnected] = useState(false);
  const byId = useRef<Map<string, Session>>(new Map());

  function commit() {
    const rows = [...byId.current.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setSessions(rows);
  }
  function upsert(list: Session[]) {
    for (const s of list) byId.current.set(s.callId, s);
    commit();
  }

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    // REST fallback so the table isn't empty before the socket opens.
    getSessions().then(upsert).catch(() => {});

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data);
          if (msg.kind === "snapshot") upsert(msg.sessions);
          else if (msg.kind === "session") upsert([msg.session]);
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    }
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { sessions, connected };
}
