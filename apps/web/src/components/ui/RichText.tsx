import type { ReactNode } from "react";

/**
 * Model answers often use **bold** and `code`. Show those properly instead of as stray asterisks and backticks.
 * Nothing else is interpreted, and everything is drawn as plain text by React, so an answer can never inject
 * markup or links.
 */
export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i} style={{ color: "#fff", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i} style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: "0.92em", background: "#171717", padding: "1px 6px", borderRadius: 6 }}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}
