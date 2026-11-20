import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "./RichText";

const html = (text: string) => renderToStaticMarkup(createElement(RichText, { text }));

describe("RichText", () => {
  it("shows **bold** as bold and drops the asterisks", () => {
    const out = html("That leaves **938.3 STRK** to go.");
    expect(out).toContain("<strong");
    expect(out).toContain(">938.3 STRK</strong>");
    expect(out).not.toContain("**");
  });

  it("shows `code` as code", () => {
    expect(html("Call `claim_creator_fees` any time.")).toContain(">claim_creator_fees</code>");
  });

  it("leaves a lone or unmatched asterisk alone", () => {
    expect(html("5 * 3 and **unfinished")).toContain("5 * 3 and **unfinished");
  });

  it("never turns an answer into markup", () => {
    const out = html('<script>alert(1)</script> **<img src=x onerror=alert(1)>** [link](javascript:alert(1))');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<a ");
    expect(out).toContain("&lt;script&gt;");
  });

  it("keeps plain text and line content untouched", () => {
    expect(html("Just a sentence.")).toBe("Just a sentence.");
  });
});
