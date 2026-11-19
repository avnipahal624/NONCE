import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicOrigin, type DappResearch } from "@/lib/dappResearch";

export function DappResearchPanel() {
  const research = useAction(api.nonce.dappResearch.research);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DappResearch | null>(null);
  return (
    <section className="rounded-2xl border border-mint/20 bg-[#0b1f17]/75 p-5">
      <p className="text-xs uppercase tracking-widest text-mint">Public-web research · TinyFish</p>
      <h2 className="mt-2 text-lg font-medium text-ivory">Research this dApp</h2>
      <p className="mt-2 text-sm text-sage">Review public claims and sources before connecting. This is an AI-generated research brief, not a security audit or permission to transact.</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setResult(null); setError(null);
        try { publicOrigin(url); } catch { setError("Enter a public HTTPS website URL."); return; }
        setBusy(true);
        try {
          const response = await research({ url });
          if (response.ok) setResult(response.result);
          else setError(response.error);
        } catch { setError("Unknown — unable to complete research. Please try again later."); }
        finally { setBusy(false); }
      }}>
        <label htmlFor="dapp-research-url" className="sr-only">Public dApp website URL</label>
        <Input id="dapp-research-url" type="url" required maxLength={2048} disabled={busy} value={url} onChange={event => { setUrl(event.target.value); setResult(null); setError(null); }} placeholder="https://project.example" className="border-hairline bg-black/25" />
        <Button disabled={busy || !url.trim()} type="submit" className="bg-mint text-[#04241a] hover:bg-mint-bright">{busy ? "Researching…" : "Research this dApp"}</Button>
      </form>
      <p className="mt-2 text-xs text-sage">Submitting sends only the website origin to TinyFish; paths and query parameters are removed. No wallet connection needed. Checks can take up to 2½ minutes.</p>
      <div aria-live="polite" aria-busy={busy}>
        {busy && <p className="mt-4 text-sm text-sage">Gathering public evidence. You can continue reviewing your payment policy below.</p>}
        {error && <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p>}
        {result && <div className="mt-5 space-y-3 text-sm">
          <p className="font-medium text-amber-300">{result.status === "UNKNOWN" ? "Unknown — insufficient evidence" : "Review required — unverified research"}</p>
          <p className="break-all text-xs text-sage">{result.origin} · Checked {new Date(result.checkedAt).toLocaleString()}</p>
          <p className="text-ivory">{result.summary}</p>
          {result.findings.map((finding, index) => <div key={index} className="rounded-lg border border-hairline p-3">
            <p className="text-ivory">{finding.observation}</p>
            <a className="mt-2 block break-all text-xs text-mint underline" href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Source: {finding.sourceUrl}</a>
          </div>)}
          <p className="text-sage">Sources are supplied by the research agent and need human verification. No reported warning does not mean a website is safe.</p>
          {result.limitations.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sage">{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        </div>}
      </div>
    </section>
  );
}
