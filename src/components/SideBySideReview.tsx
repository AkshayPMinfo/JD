import { useState } from "react";
import { wordChanges } from "../utils/wordChanges";
import type { ResumeStructure } from "../types";
import { resultEndingsFor, addResultToLine } from "../utils/resultEndings";

// Same shape as App's EditReview
export type ReviewLine = {
  id: string;
  label: string;
  original: string;
  suggested: string;
  text: string;
  status: "pending" | "accepted" | "edited" | "skipped";
  mentions: string[];
  warnings: string[];
  target: { kind: "summary" } | { kind: "exp" | "proj"; item: number; bullet: number };
  resultOnly?: boolean;
  note?: string; // shown instead of a warning, e.g. for a suggested summary
};

type Props = {
  original: ResumeStructure;
  reviews: ReviewLine[];
  onChange?: (next: ReviewLine[]) => void;
  readOnly?: boolean; // saved versions: show the changes only, no editing
};

/** Lines that differ between an original resume and its tailored copy, for the read-only view */
export function changedLines(original: ResumeStructure, tailored: ResumeStructure): ReviewLine[] {
  const out: ReviewLine[] = [];
  const add = (id: string, before: string, after: string, target: ReviewLine["target"]) => {
    if (!after || after.trim() === (before || "").trim()) return;
    out.push({ id, label: "", original: before || "", suggested: after, text: after, status: "accepted", mentions: [], warnings: [], target });
  };
  add("summary", original.summary || "", tailored.summary || "", { kind: "summary" });
  (original.workExperience || []).forEach((job, i) => {
    const t = (tailored.workExperience || []).find(x => x.id && x.id === job.id) || (tailored.workExperience || [])[i];
    (job.description || []).forEach((line, b) => add(`exp-${i}-${b}`, line, t?.description?.[b] || "", { kind: "exp", item: i, bullet: b }));
  });
  (original.projects || []).forEach((proj, i) => {
    const t = (tailored.projects || [])[i];
    (proj.description || []).forEach((line, b) => add(`proj-${i}-${b}`, line, t?.description?.[b] || "", { kind: "proj", item: i, bullet: b }));
  });
  return out;
}

/** What the line says in the resume right now */
const currentText = (r: ReviewLine | undefined, fallback: string) => {
  if (!r) return fallback;
  if (r.status === "accepted") return r.suggested;
  if (r.status === "edited") return r.text;
  return r.original || fallback;
};

/** Changed words in yellow; removed words are simply left out (the "Before" column shows them) */
function Highlighted({ before, after }: { before: string; after: string }) {
  if (!before.trim() || before === after) return <>{after}</>;
  return (
    <>
      {wordChanges(before, after).map((part, i) =>
        part.changed ? (
          <span key={i} className="bg-yellow-300 text-yellow-950 rounded-sm">{part.text}</span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

/**
 * Before and after, side by side. Safe edits are already in; edits that add a claim
 * wait in yellow for one click; blue chips offer an optional number. Click a line to change it.
 */
export default function SideBySideReview({ original, reviews, onChange = () => {}, readOnly = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pick, setPick] = useState<{ id: string; ending: string } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(reviews.map(r => [r.id, r]));
  const update = (id: string, patch: Partial<ReviewLine>) => onChange(reviews.map(r => (r.id === id ? { ...r, ...patch } : r)));
  // Up to 3 job/project lines without a number get the optional "add a number" chips
  const numberIds = reviews
    .filter(r => r.target.kind !== "summary" && r.status !== "pending" && !/\d/.test(currentText(r, r.original)))
    .slice(0, 3)
    .map(r => r.id);

  const startEdit = (id: string, text: string) => { setPick(null); setEditingId(id); setDraft(text); };
  const saveEdit = (r: ReviewLine | undefined, id: string, before: string) => {
    const text = draft.trim();
    setEditingId(null);
    if (!r) {
      // A line the AI left alone: add it as the person's own edit
      if (!text || text === before) return;
      const [kind, item, bullet] = id.split("-");
      const target = kind === "summary" ? { kind: "summary" as const } : { kind: kind as "exp" | "proj", item: Number(item), bullet: Number(bullet) };
      onChange([...reviews, { id, label: "", original: before, suggested: before, text, status: "edited", mentions: [], warnings: [], target, resultOnly: true }]);
      return;
    }
    if (!text || text === before) update(id, { status: r.status === "pending" ? "pending" : "skipped", text: r.original });
    else if (text === r.suggested) update(id, { status: "accepted" });
    else update(id, { status: "edited", text });
  };

  const renderRow = ({ id, before, label }: { id: string; before: string; label?: string }) => {
    const r = byId.get(id);
    const now = currentText(r, before);
    const held = r?.status === "pending" && !r.resultOnly;
    const changed = !!r && now !== before;
    const isEditing = !readOnly && editingId === id;
    const offerNumber = !readOnly && !!r && !isEditing && numberIds.includes(id) && pick?.id !== id;
    const saveNumber = () => {
      if (!r || !pick) return;
      if (!/\d/.test(value)) { setError("Type a number first, like 8 or 20"); return; }
      update(id, { status: "edited", text: addResultToLine(now, pick.ending, value) });
      setPick(null); setValue(""); setError(null);
    };
    return (
      <div key={id} className="grid grid-cols-2 gap-4 py-2.5 border-b border-neutral-100 last:border-b-0" id={`sbs-${id}`}>
        <div className="text-sm leading-relaxed text-neutral-500">
          {label && <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-0.5">{label}</p>}
          {before || <span className="italic">Nothing here</span>}
        </div>
        <div className="text-sm leading-relaxed text-black space-y-1.5">
          {label && <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-0.5">{label}</p>}
          {isEditing ? (
            <div className="space-y-1.5">
              <textarea
                id={`sbs-edit-${id}`}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(r, id, before); }
                  if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); }
                }}
                className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed focus:outline-none focus:border-blue-400 min-h-[72px]"
              />
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => saveEdit(r, id, before)} className="px-2.5 py-1 bg-[#2563eb] hover:bg-blue-600 text-white rounded-md cursor-pointer">Save</button>
                <button type="button" onClick={() => setEditingId(null)} className="px-2 py-1 text-neutral-600 hover:text-black cursor-pointer">Cancel</button>
                <span className="text-neutral-400">Enter to save</span>
              </div>
            </div>
          ) : readOnly ? (
            <p>{changed ? <Highlighted before={before} after={now} /> : now}</p>
          ) : (
            <p
              role="button"
              tabIndex={0}
              title="Click to edit"
              onClick={() => startEdit(id, now)}
              onKeyDown={(e) => { if (e.key === "Enter") startEdit(id, now); }}
              className="cursor-text rounded hover:bg-neutral-50 -mx-1 px-1"
            >
              {changed ? <Highlighted before={before} after={now} /> : now || <span className="italic text-neutral-400">Nothing here</span>}
            </p>
          )}
          {!readOnly && held && r && !isEditing && (
            <div className="rounded-lg bg-orange-50 border border-orange-300 px-2.5 py-2 space-y-1" id={`sbs-held-${id}`}>
              <p className="text-xs text-orange-800">
                {r.note || `Not added: ${r.warnings[0] ? r.warnings[0].charAt(0).toLowerCase() + r.warnings[0].slice(1) : `adds ${r.mentions.join(" and ")} to this line`}`}
              </p>
              <p className="text-sm text-orange-900">{r.suggested}</p>
              <button type="button" id={`sbs-add-${id}`} onClick={() => update(id, { status: "accepted" })} className="text-xs font-medium text-orange-900 underline cursor-pointer">
                {r.note ? "Add this summary" : "Add it, it's true"}
              </button>
            </div>
          )}
          {!readOnly && r && !held && !isEditing && changed && (
            <button
              type="button"
              id={`sbs-undo-${id}`}
              onClick={() => update(id, r.resultOnly ? { status: "accepted", text: r.original } : { status: "skipped", text: r.original })}
              className="text-xs text-neutral-400 hover:text-black cursor-pointer"
            >
              Undo
            </button>
          )}
          {pick?.id === id && (
            <div className="rounded-lg bg-blue-50 px-2.5 py-2 space-y-1.5" id={`sbs-number-${id}`}>
              <p className="text-sm text-neutral-800">
                …{/^[a-z]+ing\b/i.test(pick.ending) ? ", " : " "}{pick.ending.split("__")[0]}
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveNumber(); if (e.key === "Escape") { e.stopPropagation(); setPick(null); } }}
                  placeholder="8"
                  aria-label="Your number"
                  className="mx-1 w-14 border-b-2 border-blue-500 bg-white px-1 text-sm focus:outline-none"
                />
                {pick.ending.split("__")[1]}
              </p>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={saveNumber} className="px-2.5 py-1 bg-[#2563eb] hover:bg-blue-600 text-white rounded-md cursor-pointer">Add</button>
                <button type="button" onClick={() => { setPick(null); setError(null); }} className="px-2 py-1 text-neutral-600 hover:text-black cursor-pointer">Cancel</button>
              </div>
            </div>
          )}
          {offerNumber && (
            <div className="flex flex-wrap gap-1.5" id={`sbs-chips-${id}`}>
              {resultEndingsFor(now).map(ending => (
                <button
                  key={ending}
                  type="button"
                  onClick={() => { setEditingId(null); setPick({ id, ending }); setValue(""); setError(null); }}
                  className="px-2 py-0.5 text-xs rounded-md border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 cursor-pointer"
                >
                  + {ending}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const jobs = original.workExperience || [];
  const projects = original.projects || [];
  const summaryReview = byId.get("summary");

  return (
    <div className="space-y-3" id="side-by-side-review">
      {readOnly ? (
        <p className="text-xs text-neutral-600" id="sbs-legend">
          <span className="bg-yellow-300 text-yellow-950 rounded px-1.5 py-0.5 mr-1.5">Yellow</span>
          {reviews.length ? `changed for this job · ${reviews.length} ${reviews.length === 1 ? "line" : "lines"} changed` : "No lines were reworded in this version. Only skills may have been added."}
        </p>
      ) : (
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-600" id="sbs-legend">
        <span className="flex items-center gap-1.5"><span className="bg-yellow-300 text-yellow-950 rounded px-1.5 py-0.5">Yellow</span> changed for this job</span>
        <span className="flex items-center gap-1.5"><span className="bg-orange-50 border border-orange-300 text-orange-800 rounded px-1.5 py-0.5">Orange</span> not added, needs your OK</span>
        <span className="flex items-center gap-1.5"><span className="border border-dashed border-blue-300 text-blue-700 rounded px-1.5 py-0.5">+ Blue</span> add a number if true (optional)</span>
        <span className="text-neutral-400">Click any line to edit it</span>
      </div>
      )}
      <div className="border border-neutral-200 rounded-xl bg-white px-4">
        <div className="grid grid-cols-2 gap-4 pt-3 pb-1.5 border-b border-neutral-200 text-xs font-medium text-neutral-500">
          <span>Before</span>
          <span>After</span>
        </div>
        {(original.summary || summaryReview) && renderRow({ id: "summary", before: original.summary || "", label: "Summary" })}
        {!readOnly && !original.summary && !summaryReview && (
          <p className="pt-3 text-xs text-neutral-500" id="sbs-summary-tip">
            Summary: optional when you're starting out. Skip it, or add one line about the role you're aiming for.
          </p>
        )}
        {jobs.map((job, i) => (
          <div key={job.id || i}>
            <p className="pt-3 text-xs font-semibold text-neutral-700">{[job.role, job.company].filter(Boolean).join(" · ")}</p>
            {(job.description || []).map((line, b) => renderRow({ id: `exp-${i}-${b}`, before: line }))}
          </div>
        ))}
        {projects.map((proj, i) => (
          <div key={proj.id || i}>
            <p className="pt-3 text-xs font-semibold text-neutral-700">{proj.name || `Project ${i + 1}`}</p>
            {(proj.description || []).map((line, b) => renderRow({ id: `proj-${i}-${b}`, before: line }))}
          </div>
        ))}
      </div>
    </div>
  );
}
