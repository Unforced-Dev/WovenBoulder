/** Per-page document titles. */
import { useEffect } from "react";

const SUFFIX = "Woven Boulder";

export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title !== null && title.length > 0 ? `${title} — ${SUFFIX}` : SUFFIX;
  }, [title]);
}
