# TinyFish dApp research

The Firewall now includes an authenticated, advisory research panel, available even without a vault. Only a normalized public HTTPS origin is sent to TinyFish. No wallet state, balances, private keys or session credentials are sent. The backend uses TinyFish's run-sse API with a read-only research goal and validates the returned JSON and citation URLs. Findings remain unverified; the UI never declares a website safe. This does not change contract behavior or withdrawal policy.

## Activation

1. Set TINYFISH_API_KEY in the intended Convex deployment's environment variables (never VITE_TINYFISH_API_KEY or a committed secret).
2. Regenerate Convex types and deploy the backend using the project's existing deployment workflow.
3. Build and deploy the frontend against that same Convex deployment.
4. Sign in, open /firewall and submit a public project homepage. Review the displayed sources against their actual contents.

Limits: one request per account per three minutes, ten per UTC day; failed provider calls consume a slot. The database mutation reserves slots atomically. Requests time out after 150 seconds; timeout does not guarantee provider-side cancellation. Sources and conclusions are supplied by an agent and are not independently verified by NONCE. A valid response with no findings is Unknown. Provider failure, malformed output and missing configuration never produce a safe verdict.

Only the origin is sent, so path-specific phishing pages are not examined. URL validation rejects literal IP addresses, local names, custom ports and embedded credentials. Remote redirects/DNS resolution and agent browsing are controlled by TinyFish; prompt constraints are not a network security boundary. No browser sessions or wallet tools are attached. Budget controls at the provider are recommended before public rollout because per-account limits do not prevent multiple-account abuse.

## Verification

Run tests/dappResearch.test.ts with Bun. It covers sensitive URL stripping, invalid URL rejection, split SSE frames, unsafe citation rejection and failed/incomplete provider output. Live provider verification requires the backend key.

Official API example: https://github.com/tinyfish-io/tinyfish-cookbook

## Local validation outcome

- Five new research tests passed (14 assertions).
- ESLint passed for the new implementation and test files.
- Standalone research utility typecheck passed.
- Existing and new suite: 38 tests passed; testnetConfig suite could not load because the checkout omits src/convex/_generated/server.
- Full build/backend typecheck remains unverified: Convex codegen requires CONVEX_DEPLOYMENT, unavailable in this workspace.
- No live TinyFish request, deployment or GitHub push performed.
- Existing package-lock.json is out of sync; npm ci fails before this feature. Dependencies were installed locally without changing the lockfile.
