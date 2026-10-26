import { useEffect, useState } from "react";

/**
 * The app is built for laptops. On phones, say so up front instead of showing a cramped layout,
 * and let people continue if they want to.
 */
const DISMISS_KEY = "auralis_mobile_notice_dismissed";

// A phone: small screen AND a touch screen. A narrow laptop window doesn't count.
const isPhone = () =>
  typeof window !== "undefined" &&
  window.innerWidth < 768 &&
  window.matchMedia?.("(pointer: coarse)").matches === true;

export default function MobileNotice() {
  const [isSmall, setIsSmall] = useState(isPhone);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const onResize = () => setIsSmall(isPhone());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!isSmall || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div id="mobile-notice" role="dialog" aria-label="Best on a laptop" className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-6">
      <div className="max-w-sm text-left space-y-4">
        <p className="text-lg font-semibold text-black">Auralis works best on a laptop</p>
        <p className="text-sm text-neutral-600 leading-relaxed">
          Tailoring a resume means reading a job post, ticking skills and reviewing edits line by line. That's much easier on a bigger screen.
          Open this page on your laptop or desktop for the best experience.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium text-black hover:bg-neutral-50"
        >
          Continue on this phone anyway
        </button>
      </div>
    </div>
  );
}
