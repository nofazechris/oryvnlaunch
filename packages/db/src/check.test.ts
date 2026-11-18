import { describe, expect, it } from "vitest";
import { adviseOnUrls, describeConnection, passwordOf, scrubError } from "./check.js";

const POOLED = "postgres://app_user:s3cr3t-Pa55@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgres://app_user:s3cr3t-Pa55@ep-cool-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("describeConnection", () => {
  it("reports where a string points and never includes the password", () => {
    const summary = describeConnection(POOLED);
    expect(summary).toEqual({
      host: "ep-cool-123-pooler.eu-central-1.aws.neon.tech",
      database: "neondb",
      user: "app_user",
      pooled: true,
      tls: true,
    });
    expect(JSON.stringify(summary)).not.toContain("s3cr3t");
  });

  it("tells a direct string from a pooled one", () => {
    expect(describeConnection(DIRECT).pooled).toBe(false);
  });

  it("refuses something that is not a connection string, without echoing it", () => {
    for (const bad of ["hunter2-my-real-password", "http://example.com/db", ""]) {
      let message = "";
      try {
        describeConnection(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, bad).not.toBe("");
      if (bad) expect(message).not.toContain(bad);
    }
  });

  it("copes with a password that contains URL-special characters", () => {
    const url = "postgres://u:p%40ss%2Fw0rd%3F@host.neon.tech/db?sslmode=require";
    expect(describeConnection(url).host).toBe("host.neon.tech");
    expect(passwordOf(url)).toBe("p@ss/w0rd?");
  });
});

describe("scrubError", () => {
  it("removes the password and the whole string from an error message", () => {
    const error = new Error(`password authentication failed for ${POOLED} (s3cr3t-Pa55)`);
    const message = scrubError(error, POOLED);
    expect(message).not.toContain("s3cr3t-Pa55");
    expect(message).not.toContain("postgres://");
  });

  it("handles errors that are not Error objects", () => {
    expect(scrubError("plain s3cr3t-Pa55", POOLED)).toBe("plain ***");
  });

  it("leaves messages alone when there is nothing to scrub", () => {
    expect(scrubError(new Error("connection timed out"))).toBe("connection timed out");
  });
});

describe("adviseOnUrls", () => {
  const pooled = describeConnection(POOLED);
  const direct = describeConnection(DIRECT);

  it("is quiet when the pooled and direct strings are right", () => {
    expect(adviseOnUrls(pooled, direct)).toEqual([]);
  });

  it("errors when the main string is missing", () => {
    expect(adviseOnUrls(undefined, direct).some((a) => a.level === "error" && /DATABASE_URL is not set/.test(a.text))).toBe(true);
  });

  it("warns when the two strings are swapped", () => {
    const advice = adviseOnUrls(direct, pooled);
    expect(advice.filter((a) => a.level === "warn")).toHaveLength(2);
  });

  it("errors when the two strings point at different databases", () => {
    const other = describeConnection(DIRECT.replace("/neondb", "/other"));
    expect(adviseOnUrls(pooled, other).some((a) => a.level === "error" && /same database/.test(a.text))).toBe(true);
  });

  it("warns when there is no direct string to migrate with", () => {
    expect(adviseOnUrls(pooled, undefined).some((a) => /DATABASE_URL_DIRECT is not set/.test(a.text))).toBe(true);
  });
});
