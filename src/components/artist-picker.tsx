"use client";

import { useEffect, useId, useState } from "react";

const MAX = 8;

// Quick picks across eras and genres. Searched on Apple Music Thailand as typed.
const QUICK = [
  "Bodyslam",
  "Potato",
  "Clash",
  "Big Ass",
  "Getsunova",
  "Cocktail",
  "Palmy",
  "Polycat",
  "Tilly Birds",
  "Three Man Down",
  "Lula",
  "Paradox",
  "Billkin",
  "Jeff Satur",
  "Violette Wautier",
  "PUN",
  "เบิร์ด ธงไชย",
  "ไผ่ พงศธร",
  "ตั๊กแตน ชลดา",
  "ก้อง ห้วยไร่",
];

export function ArtistPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<{ id: number; name: string; genre?: string }[]>([]);
  const listId = useId();
  const full = value.length >= MAX;
  const visible = q.trim().length >= 2 ? sugs : [];

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/artists?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setSugs(d.artists ?? []))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function add(name: string) {
    const n = name.trim();
    if (!n || full) return;
    if (value.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, n]);
    setQ("");
    setSugs([]);
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="ศิลปินที่เลือก">
          {value.map((a) => (
            <li key={a} className="flex items-center gap-1 rounded-full bg-kho-khwai py-1 pl-3 pr-1 text-deep">
              <span className="font-medium">{a}</span>
              <button
                onClick={() => onChange(value.filter((v) => v !== a))}
                aria-label={`เอา ${a} ออก`}
                className="grid size-7 place-items-center rounded-full hover:bg-deep/15"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(q);
        }}
        className="relative"
      >
        <label htmlFor={listId + "-in"} className="sr-only">
          ค้นหาศิลปิน
        </label>
        <input
          id={listId + "-in"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={full}
          placeholder={full ? `เลือกได้สูงสุด ${MAX} ศิลปิน` : "พิมพ์ชื่อศิลปิน แล้วกด Enter"}
          autoComplete="off"
          aria-controls={listId}
          className="w-full rounded-xl border-2 border-stage-2 bg-night px-4 py-3 placeholder:text-muted/60 focus:border-kho focus:outline-none disabled:opacity-50"
        />
        {visible.length > 0 && (
          <ul id={listId} className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-stage-2 bg-stage shadow-xl">
            {visible.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => add(s.name)}
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-stage-2 focus:bg-stage-2"
                >
                  <span>{s.name}</span>
                  {s.genre && <span className="text-sm text-muted">{s.genre}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">เพิ่มเร็ว</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK.filter((a) => !value.includes(a)).map((a) => (
          <button
            key={a}
            onClick={() => add(a)}
            disabled={full}
            className="rounded-full border border-stage-2 px-3 py-1.5 text-[15px] hover:border-kho disabled:opacity-40"
          >
            + {a}
          </button>
        ))}
      </div>
    </div>
  );
}
