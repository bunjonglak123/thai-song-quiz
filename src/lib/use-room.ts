"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HostEngine, type HostSnapshot } from "./host-engine";
import { createTransport, hasSupabase, type Member, type RoomTransport } from "./transport";
import type { GameSettings, GameState, HostQuestion } from "./types";

export type ConnStatus = "connecting" | "ok" | "error" | "no-host";

async function fetchQuestions(settings: GameSettings) {
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const data = (await res.json().catch(() => ({}))) as {
    questions?: HostQuestion[];
    warnings?: string[];
    error?: string;
  };
  if (!res.ok || !data.questions) throw new Error(data.error || `โหลดเพลงไม่สำเร็จ (${res.status})`);
  return { questions: data.questions, warnings: data.warnings ?? [] };
}

function readSnap(key: string): HostSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as HostSnapshot) : null;
  } catch {
    return null;
  }
}

export function useRoom(code: string, me: Member | null, isHost: boolean) {
  const [state, setState] = useState<GameState | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const engineRef = useRef<HostEngine | null>(null);
  const tRef = useRef<RoomTransport | null>(null);
  const meId = me?.id;
  const meName = me?.name;
  const meColor = me?.color;

  useEffect(() => {
    if (!meId || !meName) return;
    const t = createTransport(code, { id: meId, name: meName, color: meColor });
    tRef.current = t;
    let engine: HostEngine | null = null;
    let gotState = false;
    let helloTimer: ReturnType<typeof setInterval> | null = null;
    let noHostTimer: ReturnType<typeof setTimeout> | null = null;
    const offs: (() => void)[] = [];

    if (isHost) {
      const key = `tsq:snap:${code}`;
      engine = new HostEngine(
        {
          hostId: meId,
          hostName: meName,
          hostColor: meColor,
          onChange: (s) => {
            setState(s);
            t.send("state", s);
          },
          persist: (snap) => {
            try {
              sessionStorage.setItem(key, JSON.stringify(snap));
            } catch {}
          },
          fetchQuestions,
        },
        readSnap(key),
      );
      engineRef.current = engine;
      offs.push(t.on("hello", () => t.send("state", engine!.state)));
      offs.push(
        t.on("answer", (d, from) => {
          const a = d as { questionId: string; choice: number; ms: number };
          engine!.answer({ playerId: from, questionId: a.questionId, choice: a.choice, ms: a.ms });
        }),
      );
    } else {
      offs.push(
        t.on("state", (d) => {
          gotState = true;
          setStatus("ok");
          setState(d as GameState);
        }),
      );
    }

    offs.push(
      t.onMembers((m) => {
        setMembers(m);
        engine?.syncMembers(m);
      }),
    );

    t.connect()
      .then(() => {
        if (isHost) {
          setStatus("ok");
          setState(engine!.state);
          t.send("state", engine!.state);
        } else {
          // Ask the host for the current state until it answers.
          t.send("hello", null);
          helloTimer = setInterval(() => {
            if (gotState) {
              if (helloTimer) clearInterval(helloTimer);
            } else t.send("hello", null);
          }, 2000);
          noHostTimer = setTimeout(() => {
            if (!gotState) setStatus("no-host");
          }, 8000);
        }
      })
      .catch(() => setStatus("error"));

    return () => {
      offs.forEach((f) => f());
      if (helloTimer) clearInterval(helloTimer);
      if (noHostTimer) clearTimeout(noHostTimer);
      engine?.dispose();
      engineRef.current = null;
      t.close();
      tRef.current = null;
    };
  }, [code, meId, meName, meColor, isHost]);

  const answer = useCallback(
    (questionId: string, choice: number, ms: number) => {
      if (!meId) return;
      if (engineRef.current) engineRef.current.answer({ playerId: meId, questionId, choice, ms });
      else tRef.current?.send("answer", { questionId, choice, ms });
    },
    [meId],
  );

  const host = {
    updateSettings: (s: GameSettings) => engineRef.current?.updateSettings(s),
    start: () => void engineRef.current?.start(),
    next: () => engineRef.current?.next(),
    revealNow: () => engineRef.current?.reveal(),
    backToLobby: () => engineRef.current?.backToLobby(),
  };

  const hostOnline = !!state && members.some((m) => m.id === state.hostId);

  const transportKind: "supabase" | "local" = hasSupabase ? "supabase" : "local";
  return { state, members, status, transportKind, answer, host, hostOnline };
}
