import { z } from "zod";

// Public website origins only: never forward credentials, paths or query secrets.
export function publicOrigin(input: string): string {
  const url = new URL(input.trim());
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !host.includes(".") || !/^[a-z0-9.-]+$/.test(host) ||
      /^[\d.]+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new Error("Enter a public HTTPS website without credentials or a custom port.");
  }
  return url.origin;
}

export const researchSchema = z.object({
  summary: z.string().min(1).max(2000),
  findings: z.array(z.object({
    observation: z.string().min(1).max(1200),
    sourceUrl: z.string().max(2048).refine((value) => {
      try { publicOrigin(value); return true; } catch { return false; }
    }),
  })).max(8),
  limitations: z.array(z.string().max(600)).max(8),
});
export type DappResearch = z.infer<typeof researchSchema> & {
  origin: string;
  checkedAt: number;
  status: "REVIEW_REQUIRED" | "UNKNOWN";
};

export async function readResearchStream(response: Response): Promise<z.infer<typeof researchSchema>> {
  if (!response.ok || !response.body) throw new Error("Research provider unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      bytes += value?.length ?? 0;
      if (bytes > 1_000_000) throw new Error("Research response too large.");
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "COMPLETE") {
          if (event.status !== "COMPLETED") throw new Error("Research did not complete.");
          const result = typeof event.resultJson === "string" ? JSON.parse(event.resultJson) : event.resultJson;
          return researchSchema.parse(result);
        }
        if (event.type === "ERROR") throw new Error("Research provider failed.");
      }
      if (done) throw new Error("Research ended without a usable result.");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
