// Token images: upload once, serve forever, addressed by the hash of the bytes.
//
// This is the only place the API accepts data, so it is deliberately narrow:
//  - only PNG, JPEG, WebP and GIF, and the bytes must really start like one (the declared type alone
//    proves nothing). SVG is refused: it can carry script.
//  - at most 512 KB each, so one upload cannot fill the database.
//  - a small per-address upload allowance, so a script cannot either.
//  - served back with a fixed type, `nosniff` and a locked-down CSP, so a file that fooled the
//    checks still cannot run as anything but a picture.
// Anyone can upload, because testnet launches need no account. For mainnet, require a wallet
// signature before accepting an upload.

import { createHash } from "node:crypto";
import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Req, Res, BadRequestException, HttpException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Db, eq, images, sql } from "@launchpad/db";
import { DB, IMAGE_STORAGE_LIMIT } from "./database.js";

export const MAX_IMAGE_BYTES = 512 * 1024;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** The type a file's first bytes say it is, or null. */
export function sniffImage(b: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const starts = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** A fixed-window allowance per key. In memory: it resets on restart, which is fine for an abuse brake. */
export class UploadLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(
    private readonly max = 20,
    private readonly windowMs = 60 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}
  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}

@Controller("images")
export class ImagesController {
  private readonly limiter = new UploadLimiter();
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(IMAGE_STORAGE_LIMIT) private readonly storageLimit: number,
  ) {}

  @Post()
  @HttpCode(201)
  async upload(@Req() req: FastifyRequest) {
    if (!this.limiter.allow(req.ip)) throw new HttpException("Too many uploads from this address. Try again later.", 429);
    const body = req.body;
    if (!(body instanceof Uint8Array) || body.length === 0) throw new BadRequestException(`Send the image as the raw request body with Content-Type ${IMAGE_TYPES.join(", ")}.`);
    if (body.length > MAX_IMAGE_BYTES) throw new HttpException(`Images are limited to ${MAX_IMAGE_BYTES / 1024} KB.`, 413);
    const mime = sniffImage(body);
    if (!mime) throw new BadRequestException("That does not look like a PNG, JPEG, WebP or GIF image.");
    const hash = createHash("sha256").update(body).digest("hex");
    // However many addresses a script uses, the database cannot be filled: past the ceiling, new images are refused.
    const [used] = await this.db.select({ bytes: sql<string>`coalesce(sum(${images.size}), 0)::text` }).from(images);
    if (BigInt(used?.bytes ?? "0") + BigInt(body.length) > BigInt(this.storageLimit)) throw new HttpException("Image storage is full. Try again later.", 507);
    await this.db.insert(images).values({ hash, mime, bytes: new Uint8Array(body), size: body.length }).onConflictDoNothing();
    return { hash, uri: `sha256:${hash}`, path: `/images/${hash}`, mime, size: body.length };
  }

  @Get(":hash")
  async get(@Param("hash") hash: string, @Res({ passthrough: true }) reply: FastifyReply) {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new NotFoundException("No such image");
    const [row] = await this.db.select().from(images).where(eq(images.hash, hash));
    if (!row) throw new NotFoundException("No such image");
    reply
      .header("content-type", row.mime)
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox")
      // The web app lives on another origin and draws this in an <img>.
      .header("cross-origin-resource-policy", "cross-origin");
    return Buffer.from(row.bytes);
  }
}
