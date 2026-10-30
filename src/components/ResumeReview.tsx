import { useState } from "react";
import { wordChanges } from "../utils/wordChanges";
import type { ResumeStructure } from "../types";
import type { ReviewLine } from "./SideBySideReview";
import { resultEndingsFor, addResultToLine } from "../utils/resultEndings";

type Props = {
  original: ResumeStructure;   // the person's own resume
  current: ResumeStructure;    // the tailored copy as it will download (skills, education...)
  reviews: ReviewLine[];
  onChange: (next: ReviewLine[]) => void;
};

/** One short reason for the orange box: "New word from the job post: "consumer"" */
export function shortReason(r: Pick<ReviewLine, "warnings" | "mentions">): string {
  const w = r.warnings[0] || "";
  let m: RegExpMatchArray | null;
  if ((m = w.match(/Uses "(.+?)" from the job post/))) return `New word from the job post: "${m[1]}"`;
  if ((m = w.match(/^Claims (.+?), which/))) return `New skill in this line: ${m[1]}`;
  if ((m = w.match(/Adds (?:a number|numbers) not in your resume \((.+?)\)/))) return `New number: ${m[1]}`;
  if ((m = w.match(/^Adds "(.+?)", which/))) return `New title word: "${m[1]}"`;
  if (/Claims a result/.test(w)) return "Adds a result your line didn't state";
  if (r.mentions.length) return `Adds ${r.mentions.join(" and ")} (a skill you ticked) to this line`;
  return w.replace(/\.$/, "") || "This adds something new";
}

const textNow = (r: ReviewLine | undefined, fallback: string) =>
  !r ? fallback : r.status === "accepted" ? r.suggested : r.status === "edited" ? r.text : r.original || fallback;

/** Changed words in highlighter yellow; removed words simply aren't shown */
function Highlighted({ before, after }: { before: string; after: string }) {
  if (!before.trim() || before === after) return <>{before.trim() ? after : <mark className="bg-yellow-300 text-yellow-950 rounded-sm">{after}</mark>}</>;
  return (
    <>
      {wordChanges(before, after).map((part, i) =>
        part.changed
          ? <mark key={i} className="bg-yellow-300 text-yellow-950 rounded-sm">{part.text}</mark>
          : <span key={i}>{part.text}</span>
      )}
    </>
  );
}

/**
 * The final resume, laid out like the download, with this job's changes in yellow.
 * Orange boxes are the person's call (Keep / Remove). Click a line to edit it, undo it or add a number.
 */
export default function ResumeReview({ original, current, reviews, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null); // "exp-0" or "proj-1"
  const [addDraft, setAddDraft] = useState("");

  const byId = new Map(reviews.map(r => [r.id, r]));
  const update = (id: string, patch: Partial<ReviewLine>) => onChange(reviews.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const close = () => { setOpenId(null); setEditing(false); setPick(null); setError(null); };

  const targetOf = (id: string): ReviewLine["target"] => {
    const [kind, item, bullet] = id.split("-");
    return kind === "summary" ? { kind: "summary" } : { kind: kind as "exp" | "proj", item: Number(item), bullet: Number(bullet) };
  };
  const setText = (id: string, before: string, text: string) => {
    const r = byId.get(id);
    const clean = text.trim();
    if (!r) {
      if (clean && clean !== before) onChange([...reviews, { id, label: "", original: before, suggested: before, text: clean, status: "edited", mentions: [], warnings: [], target: targetOf(id), resultOnly: true }]);
      return;
    }
    // Emptying a line the person added removes it; their own lines go back to how they wrote them
    if (!clean || clean === before) update(id, { status: r.resultOnly && before ? "accepted" : "skipped", text: r.original });
    else if (clean === r.suggested) update(id, { status: "accepted" });
    else update(id, { status: "edited", text: clean });
  };

  const line = (id: string, before: string, bullet: boolean) => {
    const r = byId.get(id);
    const held = r?.status === "pending" && !r.resultOnly;
    const now = textNow(r, before);
    const changed = now !== before;
    const isOpen = openId === id;

    if (held && r) {
      const isSummary = id === "summary";
      const editingHeld = openId === id && editing;
      // On a suggested summary, only flag years that don't match the job dates (the numbers come from those dates)
      const extra = r.note ? (r.warnings.find(w => /^Says \d+ years as/.test(w)) || "") : "";
      return (
        <div key={id} id={`rv-${id}`} className={`${bullet ? "ml-4" : ""} my-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2`}>
          <p className="text-xs text-orange-800 mb-1">
            {r.note || (isSummary ? "You didn't have a summary. We suggest one:" : `${shortReason(r)}. Keep it only if it's true.`)}
          </p>
          {extra && <p className="text-xs font-medium text-orange-900 mb-1" id={`rv-warn-${id}`}>Check: {extra}.</p>}
          {editingHeld ? (
            <textarea
              id={`rv-held-edit-${id}`}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim()) update(id, { status: "edited", text: draft.trim() }); close(); }
                if (e.key === "Escape") { e.stopPropagation(); close(); }
              }}
              className="w-full bg-white border border-orange-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed focus:outline-none focus:border-orange-400 min-h-[72px]"
            />
          ) : (
            <p className="text-sm leading-relaxed text-orange-950">{bullet ? "• " : ""}{r.suggested}</p>
          )}
          <div className="flex gap-2 mt-2">
            {editingHeld ? (
              <>
                <button type="button" id={`rv-held-save-${id}`} onClick={() => { if (draft.trim()) update(id, { status: "edited", text: draft.trim() }); close(); }} className="px-3 py-1 text-xs font-medium rounded-md bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer">Save</button>
                <button type="button" onClick={close} className="px-3 py-1 text-xs font-medium rounded-md text-orange-900 hover:bg-orange-100 cursor-pointer">Cancel</button>
              </>
            ) : (
              <>
                <button type="button" id={`rv-keep-${id}`} onClick={() => update(id, { status: "accepted" })} className="px-3 py-1 text-xs font-medium rounded-md bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer">Keep</button>
                <button type="button" id={`rv-edit-held-${id}`} onClick={() => { setOpenId(id); setDraft(r.suggested); setEditing(true); setPick(null); }} className="px-3 py-1 text-xs font-medium rounded-md border border-orange-300 bg-white text-orange-900 hover:bg-orange-100 cursor-pointer">Edit</button>
                <button type="button" id={`rv-remove-${id}`} onClick={() => update(id, { status: "skipped" })} className="px-3 py-1 text-xs font-medium rounded-md border border-orange-300 bg-white text-orange-900 hover:bg-orange-100 cursor-pointer">Remove</button>
              </>
            )}
          </div>
        </div>
      );
    }
    // A suggested summary the person removed: nothing to show
    if (!now.trim()) return null;

    const saveNumber = () => {
      if (!pick) return;
      if (!/\d/.test(value)) { setError("Type a number first, like 8 or 20"); return; }
      setText(id, before, addResultToLine(now, pick, value));
      setPick(null); setValue(""); setError(null);
    };
    return (
      <div key={id} id={`rv-${id}`} className={`${bullet ? "ml-4" : ""} ${isOpen ? "my-1.5 rounded-lg border border-neutral-300 px-3 py-2" : ""}`}>
        {isOpen && editing ? (
          <textarea
            id={`rv-edit-${id}`}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setText(id, before, draft); close(); }
              if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
            }}
            className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed focus:outline-none focus:border-blue-400 min-h-[64px]"
          />
        ) : (
          <div className="group flex items-start gap-2">
            <p
              role="button"
              tabIndex={0}
              title="Click to edit"
              onClick={() => { if (isOpen) { close(); } else { setOpenId(id); setEditing(false); setPick(null); } }}
              onKeyDown={(e) => { if (e.key === "Enter") setOpenId(isOpen ? null : id); }}
              className="flex-1 text-sm leading-relaxed text-neutral-800 cursor-pointer rounded hover:bg-neutral-50 -mx-1 px-1 py-0.5"
            >
              {bullet ? "• " : ""}{changed ? <Highlighted before={before} after={now} /> : now}
            </p>
            {!isOpen && (
              <button type="button" id={`rv-quick-edit-${id}`} aria-label="Edit this line"
                onClick={() => { setOpenId(id); setDraft(now); setEditing(true); setPick(null); setError(null); }}
                className="shrink-0 mt-0.5 px-2 py-0.5 text-[11px] rounded-md border border-neutral-200 text-neutral-500 bg-white hover:text-black hover:border-neutral-400 cursor-pointer">Edit</button>
            )}
          </div>
        )}
        {isOpen && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5" id={`rv-tools-${id}`}>
            {editing ? (
              <>
                <button type="button" onClick={() => { setText(id, before, draft); close(); }} className="px-2.5 py-1 text-xs rounded-md bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="px-2.5 py-1 text-xs rounded-md text-neutral-600 hover:text-black cursor-pointer">Cancel</button>
              </>
            ) : (
              <>
                <button type="button" id={`rv-edit-btn-${id}`} onClick={() => { setDraft(now); setEditing(true); setPick(null); }} className="px-2.5 py-1 text-xs rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 cursor-pointer">Edit</button>
                {changed && (
                  <button type="button" id={`rv-undo-${id}`} onClick={() => { setText(id, before, before); close(); }} className="px-2.5 py-1 text-xs rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 cursor-pointer">{before ? "Undo change" : "Remove line"}</button>
                )}
                {id !== "summary" && !/\d/.test(now) && resultEndingsFor(now).map(ending => (
                  <button key={ending} type="button" onClick={() => { setPick(ending); setValue(""); setError(null); }}
                    className="px-2 py-1 text-xs rounded-md border border-dashed border-blue-300 text-blue-700 bg-white hover:bg-blue-50 cursor-pointer">+ {ending}</button>
                ))}
              </>
            )}
          </div>
        )}
        {isOpen && pick && (
          <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 space-y-1.5" id={`rv-number-${id}`}>
            <p className="text-sm text-neutral-800">
              …{/^[a-z]+ing\b/i.test(pick) ? ", " : " "}{pick.split("__")[0]}
              <input type="text" inputMode="decimal" autoFocus value={value} placeholder="8" aria-label="Your number"
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") saveNumber(); if (e.key === "Escape") { e.stopPropagation(); setPick(null); } }}
                className="mx-1 w-14 border-b-2 border-blue-500 bg-white px-1 text-sm focus:outline-none" />
              {pick.split("__")[1]}
            </p>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={saveNumber} className="px-2.5 py-1 bg-[#2563eb] hover:bg-blue-600 text-white rounded-md cursor-pointer">Add</button>
              <button type="button" onClick={() => setPick(null)} className="px-2 py-1 text-neutral-600 hover:text-black cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Lines past the person's own ones: added by the AI or by the person */
  const extraLines = (kind: "exp" | "proj", item: number, own: number) =>
    reviews.filter(r => r.target.kind === kind && r.target.item === item && r.target.bullet >= own)
      .sort((a, b) => (a.target.kind === "summary" || b.target.kind === "summary" ? 0 : a.target.bullet - b.target.bullet));
  const saveNewLine = (kind: "exp" | "proj", item: number, own: number) => {
    const text = addDraft.trim();
    if (text) {
      const used = extraLines(kind, item, own).map(r => (r.target.kind === "summary" ? 0 : r.target.bullet));
      const bullet = Math.max(own, ...used.map(b => b + 1));
      onChange([...reviews, { id: `${kind}-${item}-${bullet}`, label: "", original: "", suggested: text, text, status: "edited", mentions: [], warnings: [], target: { kind, item, bullet }, resultOnly: true }]);
    }
    setAddingTo(null); setAddDraft("");
  };
  const addLine = (kind: "exp" | "proj", item: number, own: number) => {
    const key = `${kind}-${item}`;
    return addingTo === key ? (
      <div className="ml-4 mt-1.5 space-y-1.5" id={`rv-add-box-${key}`}>
        <textarea autoFocus value={addDraft} placeholder="What did you do, how, and what changed? e.g. Cut sign-up drop-offs by 15% by simplifying the form"
          onChange={(e) => setAddDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNewLine(kind, item, own); }
            if (e.key === "Escape") { e.stopPropagation(); setAddingTo(null); }
          }}
          className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed focus:outline-none focus:border-blue-400 min-h-[64px]" />
        <div className="flex gap-2">
          <button type="button" onClick={() => saveNewLine(kind, item, own)} className="px-2.5 py-1 text-xs rounded-md bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer">Add</button>
          <button type="button" onClick={() => setAddingTo(null)} className="px-2.5 py-1 text-xs rounded-md text-neutral-600 hover:text-black cursor-pointer">Cancel</button>
        </div>
      </div>
    ) : (
      <button type="button" id={`rv-add-${key}`} onClick={() => { close(); setAddingTo(key); setAddDraft(""); }}
        className="ml-4 mt-1 text-xs text-blue-700 hover:underline cursor-pointer">+ Add a line</button>
    );
  };

  const heading = (text: string) => (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1 mt-4 mb-2">{text}</p>
  );
  const originalSkills = new Set((original.skills || []).map(s => s.toLowerCase()));
  const summaryReview = byId.get("summary");
  const showSummary = !!(original.summary || (summaryReview && (summaryReview.status !== "skipped" || original.summary)));

  return (
    <div className="space-y-2" id="resume-review">
      <p className="text-xs text-neutral-600" id="rv-legend">
        <mark className="bg-yellow-300 text-yellow-950 rounded-sm px-1.5 py-0.5 mr-1">Yellow</mark> changed for this job ·
        <span className="ml-1 px-1.5 py-0.5 rounded border border-orange-300 bg-orange-50 text-orange-800 mr-1">Orange</span> your call: keep or remove ·
        <span className="ml-1 text-neutral-500">Edit any line, undo it, add a number or add a new line</span>
      </p>
      <div className="border border-neutral-200 rounded-xl bg-white px-5 py-4">
        <p className="text-lg font-semibold text-black">{current.fullName || original.fullName}</p>
        <p className="text-xs text-neutral-500">{[current.email, current.phone, current.location].filter(Boolean).join(" · ")}</p>

        {showSummary && <>{heading("Summary")}{line("summary", original.summary || "", false)}</>}
        {!original.summary && !summaryReview && (
          <p className="mt-3 text-xs text-neutral-500" id="rv-summary-tip">Summary: optional when you're starting out. Skip it, or add one line about the role you're aiming for.</p>
        )}

        {(current.skills || []).length > 0 && <>
          {heading("Skills")}
          <p className="text-sm leading-relaxed text-neutral-800" id="rv-skills">
            {(current.skills || []).map((sk, i) => (
              <span key={sk}>{i ? ", " : ""}{originalSkills.has(sk.toLowerCase()) ? sk : <mark className="bg-yellow-300 text-yellow-950 rounded-sm">{sk}</mark>}</span>
            ))}
          </p>
        </>}

        {(original.workExperience || []).length > 0 && heading("Experience")}
        {(original.workExperience || []).map((job, i) => (
          <div key={job.id || i} className="mt-2">
            <div className="flex justify-between gap-3 text-sm">
              <p className="font-semibold text-black">{[job.role, job.company].filter(Boolean).join(" — ")}</p>
              <p className="text-xs text-neutral-500 shrink-0">{job.duration}</p>
            </div>
            {(job.description || []).map((b, k) => line(`exp-${i}-${k}`, b, true))}
            {extraLines("exp", i, (job.description || []).length).map(r => line(r.id, "", true))}
            {addLine("exp", i, (job.description || []).length)}
          </div>
        ))}

        {(original.projects || []).length > 0 && heading("Projects")}
        {(original.projects || []).map((proj, i) => (
          <div key={proj.id || i} className="mt-2">
            <p className="text-sm font-semibold text-black">{proj.name}</p>
            {(proj.description || []).map((b, k) => line(`proj-${i}-${k}`, b, true))}
            {extraLines("proj", i, (proj.description || []).length).map(r => line(r.id, "", true))}
            {addLine("proj", i, (proj.description || []).length)}
          </div>
        ))}

        {(current.education || []).length > 0 && <>
          {heading("Education")}
          {(current.education || []).map((ed, i) => (
            <div key={ed.id || i} className="flex justify-between gap-3 text-sm mt-1">
              <p className="text-neutral-800"><span className="font-semibold text-black">{ed.degree}</span>{ed.school ? `, ${ed.school}` : ""}</p>
              <p className="text-xs text-neutral-500 shrink-0">{ed.duration}</p>
            </div>
          ))}
        </>}

        {(current.certifications || []).length > 0 && <>
          {heading("Certifications")}
          {(current.certifications || []).map(c => <p key={c} className="text-sm text-neutral-800">{c}</p>)}
        </>}
      </div>
    </div>
  );
}
