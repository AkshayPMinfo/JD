import { useState } from "react";
import { X } from "lucide-react";

/**
 * Plain-language privacy notice. Signed-in people get two choices:
 * delete their data (keep the account) or delete the account (everything).
 */
interface PrivacyNoticeProps {
  onClose: () => void;
  // Shown only when someone is signed in (including guests)
  onDeleteData?: () => void;
  onDeleteAccount?: () => void;
  deleting?: boolean;
  isGuest?: boolean;
}

export default function PrivacyNotice({ onClose, onDeleteData, onDeleteAccount, deleting = false, isGuest = false }: PrivacyNoticeProps) {
  const [confirming, setConfirming] = useState<"data" | "account" | null>(null);

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        id="privacy-notice"
        role="dialog"
        aria-label="Privacy"
        className="bg-white rounded-2xl border border-neutral-200 w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 text-left relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100" title="Close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-black">Your privacy</h3>
        <div className="mt-4 space-y-4 text-sm text-neutral-700 leading-relaxed">
          <div>
            <p className="font-medium text-black">What we keep</p>
            <p>The resumes you upload (the file and its text), the tailored versions you make, the job posts you paste, and your email address.</p>
          </div>
          <div>
            <p className="font-medium text-black">Why</p>
            <p>So you can see your resumes and tailored versions again, on any device you sign in from.</p>
          </div>
          <div>
            <p className="font-medium text-black">AI</p>
            <p>To suggest edits, the text of your resume and the job post is sent to an AI service (Google Gemini, or Groq as a backup). We use their answers only to build your resume.</p>
          </div>
          <div>
            <p className="font-medium text-black">What we don't do</p>
            <p>We don't sell your data, and we don't share your resume with recruiters or anyone else.</p>
          </div>
          <div>
            <p className="font-medium text-black">Deleting your data</p>
            <p>You can delete just your data (resumes, tailored versions and job posts) and keep your account, or delete your account and everything with it.</p>
          </div>
        </div>

        {(onDeleteData || onDeleteAccount) && (
          <div className="mt-6 pt-4 border-t border-neutral-200 space-y-3">
            {onDeleteData && !isGuest && (
              <div id="delete-data-box" className="rounded-xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-black">Delete my data</p>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">Removes your resumes, tailored versions and job posts. Your account stays, so you can sign in and start again.</p>
                {confirming === "data" ? (
                  <div className="mt-3 flex gap-2 justify-end">
                    <button type="button" onClick={() => setConfirming(null)} disabled={deleting} className="px-3 py-1.5 text-sm font-medium text-neutral-700 rounded-lg hover:bg-neutral-100">Cancel</button>
                    <button type="button" id="btn-confirm-delete-data" onClick={onDeleteData} disabled={deleting} className="px-3 py-1.5 text-sm font-medium text-white bg-black hover:bg-neutral-800 rounded-lg disabled:opacity-60">
                      {deleting ? "Deleting..." : "Yes, delete my data"}
                    </button>
                  </div>
                ) : (
                  <button type="button" id="btn-delete-data" onClick={() => setConfirming("data")} className="mt-3 px-3 py-1.5 text-sm font-medium text-black border border-neutral-300 rounded-lg hover:bg-neutral-50">
                    Delete my data
                  </button>
                )}
              </div>
            )}
            {onDeleteAccount && (
              <div id="delete-account-box" className="rounded-xl border border-rose-200 p-4">
                <p className="text-sm font-semibold text-rose-700">{isGuest ? "Delete my guest data" : "Delete account"}</p>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                  {isGuest ? "Removes everything you made as a guest." : "Removes everything, including your login. This can't be undone."}
                </p>
                {confirming === "account" ? (
                  <div className="mt-3 flex gap-2 justify-end">
                    <button type="button" onClick={() => setConfirming(null)} disabled={deleting} className="px-3 py-1.5 text-sm font-medium text-neutral-700 rounded-lg hover:bg-neutral-100">Cancel</button>
                    <button type="button" id="btn-confirm-delete-account" onClick={onDeleteAccount} disabled={deleting} className="px-3 py-1.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60">
                      {deleting ? "Deleting..." : "Yes, delete everything"}
                    </button>
                  </div>
                ) : (
                  <button type="button" id="btn-delete-account" onClick={() => setConfirming("account")} className="mt-3 px-3 py-1.5 text-sm font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">
                    {isGuest ? "Delete guest data" : "Delete account"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
