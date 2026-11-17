"use client";

import { useEffect, useRef, useState } from "react";
import { GAME_SERVER_URL, GameSocket, type ConnStatus, type SocketView } from "./game-socket";
import { getPlaylistTracks } from "./spotify";
import type { GameSettings, GameState, Member } from "./types";

export type { ConnStatus } from "./game-socket";

export type HostChange = { name: string; me: boolean; at: number };

/** Asks Next.js for the sealed question deck. Spotify playlists are read here, with the host's login. */
async function fetchDeck(settings: GameSettings): Promise<{ deck: string; warnings: string[] }> {
  const tracks = settings.source.kind === "spotify" ? await getPlaylistTracks(settings.source.playlistId) : undefined;
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, tracks }),
  });
  const data = (await res.json().catch(() => ({}))) as { deck?: string; warnings?: string[]; error?: string };
  if (!res.ok || !data.deck) throw new Error(data.error || `โหลดเพลงไม่สำเร็จ (${res.status})`);
  return { deck: data.deck, warnings: data.warnings ?? [] };
}

const EMPTY: SocketView = { state: null, status: "connecting", amHost: false };

export function useRoom(code: string, me: Member | null, isCreator: boolean) {
  const [view, setView] = useState<SocketView>(EMPTY);
  const [hostChange, setHostChange] = useState<HostChange | null>(null);
  const sockRef = useRef<GameSocket | null>(null);
  const meId = me?.id;
  const meName = me?.name;
  const meColor = me?.color;

  useEffect(() => {
    if (!meId || !meName || !GAME_SERVER_URL) return;
    const sock = new GameSocket({ url: GAME_SERVER_URL, code, me: { id: meId, name: meName, color: meColor }, create: isCreator });
    sockRef.current = sock;
    let prev: GameState | null = null;
    const off = sock.subscribe((v) => {
      const s = v.state;
      if (prev && s && prev.hostId !== s.hostId) {
        setHostChange({ name: s.players[s.hostId]?.name ?? "?", me: s.hostId === meId, at: Date.now() });
      }
      prev = s;
      setView(v);
    });
    sock.connect();
    return () => {
      off();
      sock.close();
      sockRef.current = null;
      setView(EMPTY);
      setHostChange(null);
    };
  }, [code, meId, meName, meColor, isCreator]);

  const send = (type: string, data?: unknown) => sockRef.current?.send(type, data);
  const answer = (questionId: string, choice: number, ms: number) => send("answer", { questionId, choice, ms });

  const host = {
    updateSettings: (s: GameSettings) => send("settings", s),
    start: async () => {
      const settings = view.state?.settings;
      if (!settings) return;
      send("loading");
      try {
        const { deck, warnings } = await fetchDeck(settings);
        send("start", { deck, warnings });
      } catch (e) {
        send("loadFailed", { message: e instanceof Error ? e.message : "โหลดเพลงไม่สำเร็จ" });
      }
    },
    next: () => send("next"),
    revealNow: () => send("reveal"),
    backToLobby: () => send("lobby"),
  };

  const { state, status, amHost } = view;
  const members: Member[] = state ? Object.values(state.players).filter((p) => p.online).map((p) => ({ id: p.id, name: p.name, color: p.color })) : [];
  const hostOnline = !!state && !!state.players[state.hostId]?.online;
  const configured = Boolean(GAME_SERVER_URL);
  return { state, members, status: status as ConnStatus, answer, host, hostOnline, amHost, hostChange, configured };
}
