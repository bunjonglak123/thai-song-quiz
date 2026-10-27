"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost";

export function Button({
  tone = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode }) {
  const base = "rounded-2xl px-5 py-3.5 font-display text-lg disabled:opacity-40 disabled:cursor-not-allowed";
  const tones: Record<Tone, string> = {
    primary: "key bg-kho text-deep",
    secondary: "key bg-stage-2 text-ink",
    ghost: "text-muted underline underline-offset-4 hover:text-ink",
  };
  return (
    <button className={`${base} ${tones[tone]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const tones = {
    info: "bg-stage border-ngo/40",
    warn: "bg-stage border-kho/50",
    error: "bg-bad/15 border-bad/60",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-[15px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export const CHOICE_MARKS = ["ก", "ข", "ค", "ง"] as const;
export const CHOICE_BG = ["bg-ko", "bg-kho", "bg-kho-khwai", "bg-ngo"] as const;

export function Equalizer({ playing }: { playing: boolean }) {
  const colors = ["bg-ko", "bg-kho", "bg-kho-khwai", "bg-ngo", "bg-ko", "bg-kho", "bg-kho-khwai"];
  const delays = [0, 220, 90, 340, 150, 260, 40];
  return (
    <div aria-hidden className={`eq flex h-14 items-end justify-center gap-1.5 ${playing ? "" : "paused"}`}>
      {colors.map((c, i) => (
        <span key={i} className={c} style={{ animationDelay: `${delays[i]}ms` }} />
      ))}
    </div>
  );
}
