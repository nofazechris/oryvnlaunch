"use client";

import { useEffect, useState } from "react";

let cached: boolean | undefined;

/**
 * A small notice shown only when this server has no AI key, so nobody mistakes the basic prepared answers
 * for a model. Renders nothing while it checks, and nothing when AI is connected.
 */
export function AiOfflineNotice({ style }: { style?: React.CSSProperties }) {
  const [configured, setConfigured] = useState<boolean | undefined>(cached);

  useEffect(() => {
    if (cached !== undefined) return;
    fetch("/api/ai/status")
      .then((r) => r.json() as Promise<{ configured?: boolean }>)
      .then((j) => {
        cached = !!j.configured;
        setConfigured(cached);
      })
      .catch(() => undefined);
  }, []);

  if (configured !== false) return null;
  return (
    <div role="status" style={{ padding: "10px 14px", borderRadius: 14, background: "rgba(243,182,95,0.08)", border: "1px solid rgba(243,182,95,0.3)", color: "#F3B65F", fontSize: 12, lineHeight: 1.5, ...style }}>
      AI is not connected on this server yet (no Anthropic key), so the answers here are basic prepared text, not from a model.
    </div>
  );
}
