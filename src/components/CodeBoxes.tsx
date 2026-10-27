import { useRef } from "react";

/**
 * One-digit boxes for an email code. Typing moves to the next box, Backspace goes back,
 * and pasting the whole code fills every box at once.
 */
interface CodeBoxesProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
}

export default function CodeBoxes({ value, onChange, length = 6 }: CodeBoxesProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // an empty box is kept as a space so the other digits stay in their boxes
  const digits = Array.from({ length }, (_, i) => (value[i] || "").trim());
  const emit = (list: string[]) => onChange(list.map(d => d || " ").join("").replace(/\s+$/, ""));

  const focus = (i: number) => boxes.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const setFrom = (i: number, typed: string) => {
    const clean = typed.replace(/\D/g, "");
    if (!clean) return;
    // One digit = this box; several (a paste or autofill) = fill from here onwards
    const next = digits.slice();
    clean.slice(0, length - i).split("").forEach((d, k) => { next[i + k] = d; });
    emit(next);
    focus(i + clean.length);
  };

  return (
    <div className="flex gap-1.5 justify-between" role="group" aria-label={`${length}-digit code`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { boxes.current[i] = el; }}
          id={i === 0 ? "input-verify-code" : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          value={d}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setFrom(i, e.target.value)}
          onPaste={e => { e.preventDefault(); setFrom(0, e.clipboardData.getData("text")); }}
          onKeyDown={e => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const next = digits.slice();
              if (next[i]) { next[i] = ""; emit(next); }
              else if (i > 0) { next[i - 1] = ""; emit(next); focus(i - 1); }
            } else if (e.key === "ArrowLeft") focus(i - 1);
            else if (e.key === "ArrowRight") focus(i + 1);
          }}
          className="w-10 h-12 min-w-0 flex-1 text-center text-xl font-semibold bg-white border border-neutral-300 rounded-lg text-black focus:outline-hidden focus:border-black focus:ring-2 focus:ring-neutral-100"
        />
      ))}
    </div>
  );
}
