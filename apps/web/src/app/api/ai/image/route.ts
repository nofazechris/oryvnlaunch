import { NextResponse } from "next/server";
import { clientIp, fromThisSite, guardAi, rateLimit, readJson } from "@/lib/ai/claude";
import { generateImage, hordeCheck, hordeSubmit, imageProvider, isJobId } from "@/lib/ai/image";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Start a picture from a few words. With Cloudflare the picture comes straight back ({ image }). With the free
 * community network it is queued, so this returns a job to ask about ({ job }) and the page checks every few seconds.
 */
export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  const provider = imageProvider();
  if (!provider) return json({ error: "Picture making is not available on this server." }, 503);

  // Pictures cost more than text, so they get a smaller allowance of their own, per caller and for the whole site.
  const hourly = Math.max(1, Number(process.env.IMAGE_GLOBAL_PER_HOUR) || 40);
  if (!rateLimit(`img:${clientIp(req)}`, 3, 3)) return json({ error: "That is a lot of pictures. Try again in a minute." }, 429);
  if (!rateLimit("img:all", hourly, hourly / 60)) return json({ error: "The picture maker is busy. Try again later." }, 429);

  let idea = "";
  try {
    const body = (await readJson(req)) as { prompt?: unknown };
    idea = String(body.prompt ?? "").trim().slice(0, 300);
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!idea) return json({ error: "Describe the picture you want." }, 400);

  if (provider.kind === "cloudflare") {
    const r = await generateImage(idea);
    return r.ok ? json({ image: `data:${r.mime};base64,${r.base64}` }) : json({ error: r.error }, r.status);
  }
  const job = await hordeSubmit(idea);
  return job.ok ? json({ job: job.id }) : json({ error: job.error }, job.status);
}

/** Ask where a queued picture is. Cheap and frequent, so it has its own limit instead of the text allowance. */
export async function GET(req: Request) {
  if (!fromThisSite(req)) return json({ error: "Not allowed." }, 403);
  if (imageProvider()?.kind !== "horde") return json({ error: "Picture making is not available on this server." }, 503);
  if (!rateLimit(`imgpoll:${clientIp(req)}`, 40, 40)) return json({ error: "Checking too often. Wait a moment." }, 429);
  const id = new URL(req.url).searchParams.get("job");
  if (!isJobId(id)) return json({ error: "That picture request is not valid." }, 400);
  const step = await hordeCheck(id);
  if (step.state === "done") return json({ state: "done", image: `data:${step.mime};base64,${step.base64}` });
  return json(step);
}
