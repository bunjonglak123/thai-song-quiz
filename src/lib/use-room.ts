"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, type FetchedQuestions, type RoomView } from "./room";
import { getPlaylistTracks } from "./spotify";
import { createTransport, hasSupabase, type Member } from "./transport";
import type { GameSettings, HostQuestion } from "./types";

export type { ConnStatus } from "./room";

async function fetchQuestions(settings: GameSettings): Promise<FetchedQuestions> {
  // Spotify only lets the logged-in host read their playlist, so the host's browser
  // fetches the song list and sends it along.
  const tracks = settings.source.kind === "spotify" ? await getPlaylistTracks(settings.source.playlistId) : undefined;
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, tracks }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<FetchedQuestions> & { error?: string };
  if (!res.ok || !data.questions) throw new Error(data.error || `โหลดเพลงไม่สำเร็จ (${res.status})`);
  return { questions: data.questions, warnings: data.warnings ?? [], deck: data.deck, deckId: data.deckId };
}

async function openDeck(deck: string): Promise<HostQuestion[]> {
  const res = await fetch("/api/deck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck }),
  });
  const data = (await res.json().catch(() => ({}))) as { questions?: HostQuestion[] };
  if (!res.ok || !data.questions) throw new Error("open deck failed");
  return data.questions;
}

const sessionKV = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
  remove: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  },
};

const EMPTY: RoomView = { state: null, members: [], status: "connecting", amHost: false, hostChange: null };

export function useRoom(code: string, me: Member | null, isCreator: boolean) {
  const [view, setView] = useState<RoomView>(EMPTY);
  const roomRef = useRef<Room | null>(null);
  const meId = me?.id;
  const meName = me?.name;
  const meColor = me?.color;

  useEffect(() => {
    if (!meId || !meName) return;
    const member = { id: meId, name: meName, color: meColor };
    const room = new Room({
      code,
      me: member,
      isCreator,
      transport: createTransport(code, member),
      fetchQuestions,
      openDeck,
      storage: sessionKV,
    });
    roomRef.current = room;
    const off = room.subscribe(setView);
    void room.start();
    return () => {
      off();
      room.dispose();
      roomRef.current = null;
      setView(EMPTY);
    };
  }, [code, meId, meName, meColor, isCreator]);

  const answer = useCallback((questionId: string, choice: number, ms: number) => roomRef.current?.answer(questionId, choice, ms), []);

  const host = {
    updateSettings: (s: GameSettings) => roomRef.current?.host.updateSettings(s),
    start: () => roomRef.current?.host.start(),
    next: () => roomRef.current?.host.next(),
    revealNow: () => roomRef.current?.host.revealNow(),
    backToLobby: () => roomRef.current?.host.backToLobby(),
  };

  const { state, members, status, amHost, hostChange } = view;
  const hostOnline = !!state && (amHost || members.some((m) => m.id === state.hostId));
  const transportKind: "supabase" | "local" = hasSupabase ? "supabase" : "local";
  return { state, members, status, transportKind, answer, host, hostOnline, amHost, hostChange };
}
