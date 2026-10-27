"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CHOICE_BG, CHOICE_MARKS } from "@/components/ui";
import { markHost, newRoomCode, normalizeCode, saveName, savedName } from "@/lib/identity";
import { useMounted } from "@/lib/use-mounted";

export default function Home() {
  return useMounted() ? <HomeForm /> : <main className="min-h-dvh" />;
}

function HomeForm() {
  const router = useRouter();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState("");
  const [nameError, setNameError] = useState(false);

  function requireName() {
    const n = name.trim();
    if (!n) {
      setNameError(true);
      document.getElementById("name")?.focus();
      return null;
    }
    saveName(n);
    return n;
  }

  function create() {
    if (!requireName()) return;
    const c = newRoomCode();
    markHost(c);
    router.push(`/room/${c}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    if (!requireName()) return;
    const c = normalizeCode(code);
    if (c.length < 4) return;
    router.push(`/room/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-10 pt-12 sm:px-6 lg:px-10">
      <div className="grid flex-1 gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-12 lg:gap-24">
        <section>
          <div aria-hidden className="mb-6 flex gap-2 lg:mb-10 lg:gap-3">
            {CHOICE_MARKS.map((m, i) => (
              <span
                key={m}
                className={`grid size-11 place-items-center rounded-xl font-display text-2xl text-deep md:size-14 md:text-3xl lg:size-20 lg:rounded-2xl lg:text-5xl ${CHOICE_BG[i]}`}
              >
                {m}
              </span>
            ))}
          </div>
          <h1 className="font-display text-5xl leading-[1.15] md:text-6xl lg:text-8xl">ทายเพลงไทย</h1>
          <p className="mt-3 max-w-[32ch] text-lg text-muted lg:mt-6 lg:text-2xl lg:leading-relaxed">
            เปิดห้อง ส่งรหัสให้เพื่อน แล้วแข่งกันฟังท่อนสั้นๆ ใครรู้ก่อนได้คะแนนมากกว่า
          </p>
        </section>

        <section className="md:rounded-3xl md:bg-stage/60 md:p-8 lg:p-10">
          <label htmlFor="name" className="block text-[15px] text-muted">
            ชื่อที่เพื่อนจะเห็น
          </label>
          <input
            id="name"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            placeholder="เช่น ภานุ"
            aria-invalid={nameError}
            aria-describedby={nameError ? "name-err" : undefined}
            className="mt-2 w-full rounded-2xl border-2 border-stage-2 bg-stage px-4 py-3.5 text-lg placeholder:text-muted/60 focus:border-kho focus:outline-none md:bg-night"
          />
          {nameError && (
            <p id="name-err" className="mt-2 text-bad">
              ใส่ชื่อก่อนเข้าห้อง
            </p>
          )}

          <Button className="mt-6 w-full" onClick={create}>
            สร้างห้องใหม่
          </Button>

          <form onSubmit={join} className="mt-10 rounded-2xl bg-stage p-4 md:mt-8 md:bg-night/60">
            <label htmlFor="code" className="block text-[15px] text-muted">
              มีรหัสห้องจากเพื่อนแล้ว
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="ABCDE"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-xl border-2 border-stage-2 bg-night px-4 py-3 font-display text-xl tracking-[0.2em] placeholder:tracking-[0.2em] placeholder:text-muted/40 focus:border-kho focus:outline-none"
              />
              <Button tone="secondary" type="submit" disabled={code.length < 4}>
                เข้าห้อง
              </Button>
            </div>
          </form>
        </section>
      </div>

      <p className="pt-10 text-sm text-muted/80">ตัวอย่างเพลง 30 วินาทีจาก Apple Music</p>
    </main>
  );
}
