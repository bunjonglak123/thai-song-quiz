"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { finishSpotifyLogin } from "@/lib/spotify";

// Spotify sends the host here after login (normally inside a popup).
export default function SpotifyCallback() {
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    finishSpotifyLogin(window.location.search)
      .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "เชื่อม Spotify ไม่สำเร็จ" }))
      .then((r) => {
        if (cancelled) return;
        setStatus(r);
        if (window.opener) {
          window.opener.postMessage({ type: "tsq-spotify", ok: r.ok }, window.location.origin);
          if (r.ok) window.close();
        } else if (r.ok) {
          // Popup was blocked and we came here by redirect: go back to the room.
          const back = localStorage.getItem("tsq:spotify:return");
          localStorage.removeItem("tsq:spotify:return");
          window.location.replace(back || "/");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      {!status ? (
        <p className="text-lg">กำลังเชื่อม Spotify…</p>
      ) : status.ok ? (
        <p className="text-lg">เชื่อม Spotify แล้ว ปิดหน้าต่างนี้ได้เลย</p>
      ) : (
        <>
          <p className="text-lg text-bad">{status.error}</p>
          <Link href="/" className="text-ngo underline underline-offset-4">
            กลับหน้าแรก
          </Link>
        </>
      )}
    </main>
  );
}
