"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { initialOf } from "@/lib/identity";

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

const AVATAR_SIZES = {
  xs: "size-6 text-xs",
  sm: "size-8 text-sm",
  md: "size-10 text-lg",
  lg: "size-16 text-3xl",
} as const;

/** A player's coloured circle with their initial — used everywhere a player appears. */
export function Avatar({
  name,
  color,
  size = "sm",
  ring = false,
  className = "",
}: {
  name: string;
  color?: string;
  size?: keyof typeof AVATAR_SIZES;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-display leading-none text-deep ${AVATAR_SIZES[size]} ${
        ring ? "ring-2 ring-ink ring-offset-2 ring-offset-deep" : ""
      } ${className}`}
      style={{ backgroundColor: color ?? "#b9b2e6" }}
    >
      {initialOf(name)}
    </span>
  );
}

/** Row of colour swatches; the chosen one shows the player's initial. */
export function ColorPicker({
  colors,
  value,
  onChange,
  name,
  id,
}: {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
  name: string;
  id?: string;
}) {
  return (
    <div id={id} role="radiogroup" aria-label="สีประจำตัว" className="flex flex-wrap gap-2">
      {colors.map((c, i) => {
        const on = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`สีที่ ${i + 1}`}
            onClick={() => onChange(c)}
            className={`grid size-10 place-items-center rounded-full font-display text-lg text-deep transition-transform ${
              on ? "scale-110 ring-3 ring-ink ring-offset-2 ring-offset-night" : "opacity-80 hover:opacity-100"
            }`}
            style={{ backgroundColor: c }}
          >
            {on ? initialOf(name || "?") : ""}
          </button>
        );
      })}
    </div>
  );
}
