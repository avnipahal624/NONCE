import { describe, it, expect } from "bun:test";
import { publicOrigin, readResearchStream } from "../src/lib/dappResearch";

describe("dApp research boundaries", () => {
  it("strips sensitive paths, queries and fragments", () => {
    expect(publicOrigin("https://example.org/private?token=secret#key")).toBe("https://example.org");
  });
  it("rejects local URLs, credentials and non-HTTPS protocols", () => {
    for (const url of ["http://example.org", "https://127.0.0.1", "https://2130706433", "https://[::1]", "https://foo.local", "https://user:pass@example.org", "https://example.org:9000", "javascript:alert(1)"]) expect(() => publicOrigin(url)).toThrow();
  });
  it("parses chunked SSE and validates citations", async () => {
    const event = 'data: '+JSON.stringify({ type: "COMPLETE", status: "COMPLETED", resultJson: { summary: "Unverified", findings: [{ observation: "Claim", sourceUrl: "https://example.org/report" }], limitations: [] } })+'\r\n\r\n';
    const stream = new ReadableStream({start(controller) { const bytes = new TextEncoder().encode(event); for (let i=0;i<bytes.length;i+=7) controller.enqueue(bytes.slice(i,i+7)); controller.close(); }});
    expect((await readResearchStream(new Response(stream))).findings).toHaveLength(1);
  });
  it("rejects completed runs with unusable output or unsafe links", async () => {
    for (const resultJson of [{ error: "blocked" }, { summary: "x", findings: [{ observation: "x", sourceUrl: "javascript:alert(1)" }], limitations: [] }]) {
      await expect(readResearchStream(new Response('data: '+JSON.stringify({type:"COMPLETE",status:"COMPLETED",resultJson})+'\n\n'))).rejects.toThrow();
    }
  });
  it("does not treat a failed or incomplete stream as success", async () => {
    await expect(readResearchStream(new Response('data: {"type":"COMPLETE","status":"FAILED"}\n\n'))).rejects.toThrow();
    await expect(readResearchStream(new Response('data: {"type":"PROGRESS"}\n\n'))).rejects.toThrow();
  });
});
