import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

/**
 * "How was it?" thumbs up / down with an optional comment.
 * Used after a download and from "Send feedback" in the sidebar.
 */
interface FeedbackBoxProps {
  onSend: (rating: "up" | "down" | null, comment: string) => Promise<void>;
  onSkip?: () => void;
  title?: string;
}

export default function FeedbackBox({ onSend, onSkip, title = "How was it?" }: FeedbackBoxProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return <p id="feedback-thanks" className="text-sm text-emerald-700 font-medium">Thanks! Your feedback was sent.</p>;
  }

  const send = async () => {
    if (!rating && !comment.trim()) {
      setError("Pick a thumb or write a comment first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(rating, comment.trim());
      setSent(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const thumb = (value: "up" | "down") =>
    `flex-1 flex items-center justify-center py-2.5 rounded-lg border transition cursor-pointer ${
      rating === value ? "border-black bg-neutral-100 text-black" : "border-neutral-300 text-neutral-600 hover:border-black hover:text-black"
    }`;

  return (
    <div id="feedback-box" className="space-y-3">
      <p className="text-sm font-semibold text-black">{title}</p>
      <div className="flex gap-2">
        <button type="button" id="btn-feedback-up" aria-label="Good" aria-pressed={rating === "up"} onClick={() => { setRating("up"); setError(null); }} className={thumb("up")}>
          <ThumbsUp className="w-5 h-5" />
        </button>
        <button type="button" id="btn-feedback-down" aria-label="Not good" aria-pressed={rating === "down"} onClick={() => { setRating("down"); setError(null); }} className={thumb("down")}>
          <ThumbsDown className="w-5 h-5" />
        </button>
      </div>
      <textarea
        id="input-feedback-comment"
        value={comment}
        maxLength={2000}
        onChange={(e) => { setComment(e.target.value); setError(null); }}
        placeholder="What should we improve? (optional)"
        rows={3}
        className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-black placeholder-neutral-400 focus:outline-hidden focus:border-black resize-none"
      />
      {error && <p className="text-xs text-rose-700 font-medium">{error}</p>}
      <div className="flex justify-end gap-2">
        {onSkip && (
          <button type="button" id="btn-feedback-skip" onClick={onSkip} className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100 cursor-pointer">
            Skip
          </button>
        )}
        <button type="button" id="btn-feedback-send" onClick={send} disabled={sending} className="px-3 py-1.5 text-sm font-medium text-white bg-black hover:bg-neutral-800 rounded-lg disabled:opacity-60 cursor-pointer">
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
