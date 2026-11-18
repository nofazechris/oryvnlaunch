// What a launch's `metadata_uri` says, read safely.
//
// The URI is chosen by whoever launched the token, so it is untrusted input. We only read the one
// kind we can check completely: a small `data:` JSON document that the launch page writes. We never
// fetch an `ipfs://` or `https://` URI on a visitor's behalf (that would leak their interest to a
// stranger's server and invite server-side request forgery), and everything we do read is checked
// field by field. Anything that does not pass is dropped, never repaired.

import { z } from "zod";

const PREFIX = "data:application/json;base64,";
/** The launch page writes well under 1 KB. Anything near this is not ours. */
const MAX_BYTES = 4_096;

export const IMAGE_REF = /^sha256:([0-9a-f]{64})$/;

// The same shapes the launch page accepts, turned into a link that is safe to put in an href.
const LINKS: Record<string, { re: RegExp; href: (v: string) => string }> = {
  web: { re: /^https?:\/\/[^\s.]+\.[^\s]+$/, href: (v) => v },
  x: { re: /^@?[A-Za-z0-9_]{1,15}$/, href: (v) => `https://x.com/${v.replace(/^@/, "")}` },
  tg: { re: /^(https?:\/\/)?t\.me\/[A-Za-z0-9_]{4,}$/, href: (v) => (v.startsWith("http") ? v : `https://${v}`) },
  dc: { re: /^(https?:\/\/)?discord\.(gg|com\/invite)\/[A-Za-z0-9-]+$/, href: (v) => (v.startsWith("http") ? v : `https://${v}`) },
};

const Document = z.object({
  v: z.literal(1),
  description: z.string().max(280).optional(),
  links: z.record(z.string(), z.string().max(200)).optional(),
  image: z.string().regex(IMAGE_REF).optional(),
});

export interface Metadata {
  description: string;
  /** Only links that passed the checks, each as an absolute URL. */
  links: Partial<Record<"web" | "x" | "tg" | "dc", string>>;
  /** Lowercase hex SHA-256 of the image, if the launch has one. */
  imageHash: string | null;
}

/** The launch's metadata, or null when there is none or it is not something we can read safely. */
export function parseMetadata(uri: string): Metadata | null {
  if (!uri.startsWith(PREFIX)) return null;
  const encoded = uri.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || Math.ceil((encoded.length * 3) / 4) > MAX_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = Document.safeParse(json);
  if (!parsed.success) return null;

  const links: Metadata["links"] = {};
  for (const [key, value] of Object.entries(parsed.data.links ?? {})) {
    const rule = LINKS[key];
    const v = value.trim();
    if (rule && rule.re.test(v)) links[key as keyof Metadata["links"]] = rule.href(v);
  }
  const hash = parsed.data.image ? IMAGE_REF.exec(parsed.data.image)?.[1] ?? null : null;
  return { description: (parsed.data.description ?? "").trim(), links, imageHash: hash };
}
