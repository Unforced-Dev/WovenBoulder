/**
 * Markdown renderer: marked → DOMPurify → innerHTML. The content comes
 * from our own gated backend (already email-stripped), but sanitizing
 * is cheap defense-in-depth for a public site.
 */
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

/** Drop a leading H1 (the vault note title duplicates the page header). */
function stripLeadingTitle(md: string): string {
  return md.replace(/^#\s[^\n]*\n+/, "");
}

export function Markdown(props: {
  source: string;
  className?: string;
  stripTitle?: boolean;
}) {
  const html = useMemo(() => {
    const src = props.stripTitle === true ? stripLeadingTitle(props.source) : props.source;
    const raw = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [props.source, props.stripTitle]);

  return (
    <div
      className={props.className ?? "markdown"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
