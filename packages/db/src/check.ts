// Helpers for the connection checker. The one rule: a connection string contains a password, so
// nothing here ever returns, logs or throws it. Everything printed goes through these functions.

export interface ConnectionSummary {
  host: string;
  database: string;
  user: string;
  /** Neon's pooled hosts contain "-pooler". */
  pooled: boolean;
  /** Whether the string asks for TLS. Neon requires it. */
  tls: boolean;
}

/** Describe a connection string without revealing its password. Throws a safe message if it is malformed. */
export function describeConnection(url: string): ConnectionSummary {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never echo the input: it may be a real password pasted into the wrong place.
    throw new Error("not a valid connection string. It should look like postgres://user:password@host/database?sslmode=require");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("a connection string must start with postgres:// or postgresql://");
  }
  const sslmode = parsed.searchParams.get("sslmode");
  return {
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, "") || "(default)",
    user: decodeURIComponent(parsed.username) || "(none)",
    pooled: parsed.hostname.includes("-pooler"),
    tls: sslmode === "require" || sslmode === "verify-full" || sslmode === "verify-ca",
  };
}

/** The password inside a connection string, for scrubbing it out of error messages. */
export function passwordOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return "";
  }
}

/** An error message with the password (and the whole connection string) removed. */
export function scrubError(error: unknown, ...urls: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const url of urls) {
    // The whole string first: once the password is replaced the string no longer matches.
    message = message.split(url).join("<connection string>");
    const password = passwordOf(url);
    if (password.length >= 4) message = message.split(password).join("***");
  }
  return message;
}

export interface Advice {
  level: "ok" | "warn" | "error";
  text: string;
}

/** Plain-language findings about the two Neon strings. Pure, so it is easy to test. */
export function adviseOnUrls(pooled: ConnectionSummary | undefined, direct: ConnectionSummary | undefined): Advice[] {
  const advice: Advice[] = [];
  if (!pooled) advice.push({ level: "error", text: "DATABASE_URL is not set. The indexer and the API need it (Neon's pooled connection string)." });
  else if (!pooled.pooled) advice.push({ level: "warn", text: "DATABASE_URL does not look pooled (no \"-pooler\" in the host). It works, but the indexer and API should use Neon's pooled string." });
  if (!direct) advice.push({ level: "warn", text: "DATABASE_URL_DIRECT is not set. Migrations will use DATABASE_URL, which goes through a pooler." });
  else if (direct.pooled) advice.push({ level: "warn", text: "DATABASE_URL_DIRECT looks pooled. Migrations should use Neon's direct string (no \"-pooler\" in the host)." });
  for (const [name, c] of [["DATABASE_URL", pooled], ["DATABASE_URL_DIRECT", direct]] as const) {
    if (c && !c.tls && !/^(localhost|127\.0\.0\.1)$/.test(c.host)) {
      advice.push({ level: "warn", text: `${name} has no sslmode=require. Neon only accepts encrypted connections; the app forces TLS, but keep the string as Neon gave it.` });
    }
  }
  if (pooled && direct && pooled.database !== direct.database) {
    advice.push({ level: "error", text: `DATABASE_URL points at database "${pooled.database}" but DATABASE_URL_DIRECT at "${direct.database}". They must be the same database.` });
  }
  return advice;
}
