import { useState } from "react";
import { X } from "lucide-react";

/**
 * Plain-language privacy notice, with "delete my account and data" for signed-in people.
 */
interface PrivacyNoticeProps {
  onClose: () => void;
  // Shown only when someone is signed in (including guests)
  onDeleteAccount?: () => void;
  deleting?: boolean;
}

export default function PrivacyNotice({ onClose, onDeleteAccount, deleting = false }: PrivacyNoticeProps) {
  const [confirming, setConfirming] = useState(false);

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
            <p>You can delete your account at any time. This permanently removes your resumes, tailored versions and job posts.</p>
          </div>
        </div>

        {onDeleteAccount && (
          <div className="mt-6 pt-4 border-t border-neutral-200">
            {!confirming ? (
              <button
                type="button"
                id="btn-delete-account"
                onClick={() => setConfirming(true)}
                className="text-sm font-medium text-rose-600 hover:text-rose-700"
              >
                Delete my account and data
              </button>
            ) : (
              <div className="rounded-lg bg-rose-50 p-3 space-y-3">
                <p className="text-sm text-rose-900">This permanently deletes your account, resumes and tailored versions. It can't be undone.</p>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="px-3 py-1.5 text-sm font-medium text-neutral-700 rounded-lg hover:bg-white">
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="btn-confirm-delete-account"
                    onClick={onDeleteAccount}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60"
                  >
                    {deleting ? "Deleting..." : "Yes, delete everything"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
