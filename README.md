# AuthPath — OAuth launch readiness guides

**Take-home assignment: APM Integrations | October 28, 2026**

AuthPath is a small, runnable product for developers building AI agents that need their end users to connect a provider account. It tells a developer **which OAuth path to choose, what to do next, who owns each action, how much time to budget, what approval actually means, and how to recover from blockers**.

Rather than treating every integration as requiring a provider approval, AuthPath explicitly separates **OAuth client registration**, **end-user consent**, **workspace administrator authorization**, and **optional provider Marketplace review**.

## Run it (no dependencies)

Requires **Node.js 20+**. No `npm install`, databases or Docker are needed for the curated library.

```bash
# from project root
npm start
# open http://localhost:3001
```

To enable live investigation for any unfamiliar provider:

```bash
export OPENAI_API_KEY="your-own-key"        # never commit this
export OPENAI_MODEL="gpt-5-mini"            # optional
npm start
```

The API key remains **server-side** and is never exposed in browser HTML or a front-end bundle. An API account with access to the configured model and Responses API `web_search` tool is required; the research requests can incur usage charges.

### Deploy (Railway or any Docker-capable host)

1. Push this directory to a new GitHub repository.
2. Create a Railway service from the repository. Its included `Dockerfile` starts `node server/index.js` and uses the `PORT` variable from the host.
3. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` as server secrets. Add a persistent volume and set `DATA_DIR=/data` (or the mounted absolute path) to retain generated guides across deploys.
4. Open the deployed service URL. Guide URLs are `/guides/<slug>` and can be shared with another person. No authentication is required to view them.

The project is a single HTTP process and uses only Node's built-in modules, reducing setup and external dependency risk.

## What works

- Searchable library with **four carefully chosen curated provider guides** (GitHub, Google APIs, Slack and Notion).
- Provider-specific **branching**: e.g., GitHub OAuth App versus GitHub App; Slack unlisted versus Marketplace; Google basic versus sensitive/restricted; Notion OAuth versus listing.
- **Setup effort and review wait kept separate**, with explicitly unknown or conditional estimates.
- Requirements, cited execution plan, likely blockers, agent/human responsibilities, unknowns and evidence list.
- **Interactive local checklist** (stored in browser `localStorage`; never mistaken for provider-side progress).
- **Shareable links**, readable without logging in, and downloadable Markdown guide.
- **Live unfamiliar-app investigation** via an OpenAI Responses API call with the web-search tool. Emits progress using Server-Sent Events (SSE). Parsed JSON is normalized, cited source IDs checked, URLs filtered to HTTPS public hosts, and source URLs probed for reachability. Persisted to `DATA_DIR/generated.json`.
- Clear no-key configuration warning: curated guides are still available even when live research is unavailable.
- Minimal per-IP research throttle (six requests per hour); maximum 140-character provider input; no credentials requested.

## Demo walkthrough (3–4 minutes)

1. Open **GitHub**. Show that a GitHub App is often the better model than a classic OAuth app, and that there is no standard manual provider review just to register a classic OAuth app.
2. Open **Google APIs**. Compare the sign-in/non-sensitive, sensitive, and restricted-scope paths, including when verification and an external assessment might apply.
3. Open **Slack**. Compare a pilot through unlisted distribution with Marketplace qualification: 10 active workspaces and published review stages. Check one action off; show the progress indicator.
4. Open **Notion**. Show the one-time installation scope decision, optional Marketplace listing, and published initial review response window.
5. Click **Research an app**. Enter `Linear` or `Dropbox`, optionally a use case. With a configured API key, watch the stage updates and open the generated guide. Copy its link or export Markdown. On a no-key installation the warning is explicit.

## Product choices and why

**1. The unit of value is a launch decision, not a page of instructions.** A developer first needs to know whether the app is self-service, scope-dependent, constrained by a workspace admin, or held up by review. Branches and a prominent timeline make that visible before a long checklist.

**2. Separate effort from waiting.** Engineering effort (our estimate) is distinct from official provider review windows, and a first response is not final approval. Unknown timelines remain unknown.

**3. Be cautious with the word “approval.”** Google scope verification, Slack Marketplace review, Notion Marketplace review, and customer workspace-admin permission are materially different things. Treating them all as a mandatory approval step would send developers down the wrong path.

**4. Don't pretend to act with a user's identity.** The agent can search docs, compare scope models, write code scaffolds, and draft review artifacts; it cannot register an OAuth app, click an authenticated console, approve terms, obtain a secret, demonstrate a live installed app, or accelerate review without access and permissions.

**5. Prefer trustworthy evidence and explicit gaps.** Curated examples are source-backed; generated guides distinguish source URLs checked for reachability from claims independently inspected. We explicitly show unverified items rather than fabricating precision.

**6. Focus on four diverse providers instead of superficially writing 100 guides.** The guide schema and API are extensible; the assignment explicitly permits a focused slice. The highest-risk differences are covered by the examples.

**7. Managed OAuth is a separate route.** In Composio's model, managed OAuth means Composio owns the provider OAuth client, registration, credentials and redirect. Developers may choose their own OAuth app for custom scopes, consent-screen branding, or separate quota. AuthPath focuses on the **bring-your-own-provider-app** route and links to the managed-auth alternative. See https://docs.composio.dev/toolkits/managed-auth.

## Architecture

```
Browser (HTML/CSS/vanilla JS, no build step)
  ├── GET /api/guides            → Curated JSON + generated JSON
  ├── GET /api/guides/:slug      → Shareable full guide
  └── POST /api/research         → SSE stage updates
                                     │
                            OpenAI Responses API
                               + web_search
                                     │
                         JSON parse + normalize + source checks
                                     │
                            generated.json (local or volume)
```

The schema in `data/guides.json` can be used to pre-author the longer-term 100-app library. Agent-generated guides use the same schema. Rendering escapes model text to prevent HTML injection.

## Verification: what was actually done

- **Read official published docs** for GitHub app registration/authorization, Slack distribution/review and September 2026 requirements, Google scope verification, and Notion public OAuth/Marketplace docs. Sources appear on each guide.
- **Corrected Notion** during research: the previous broad assumption of an unknown Marketplace timeline is incorrect. Its official FAQ says to expect an initial email response in **5–10 business days**; listing is optional, and installation scope is immutable after creating the public connection.
- **Clarified Slack** with its current official rules: 10 active workspace installs maintained during review; preliminary feedback up to 10 business days and functional review up to 10 weeks for new submissions. These are not a blanket delay on every Slack OAuth app.
- **Ran automated tests** for provider guide source linkage, sanitization, normalizing citations, HTTP routes and the full unfamiliar-app SSE/persistence flow against a mocked OpenAI response.
- **Started the real local HTTP server** and checked `/api/health`, `/api/guides/github`, and `/guides/github` via HTTP requests.

```bash
npm test
```

**Not done / unverified:** No real provider accounts were created, app credentials obtained, authorization code exchanged, Marketplace submission attempted, or provider approval received. The end-to-end live-generation test uses a **mock** model response, not a real model search. The live model path requires a user-supplied API key and network connectivity and has not been exercised against a real OpenAI account in this environment. URL reachability is *not* proof that every claim is supported. The browser could not be smoke-tested in the execution sandbox because Chromium navigation was blocked by administrator policy; API and automated code tests completed.

See `EVIDENCE.md` for app-by-app primary-source checks.

## Limitations and future priorities

- No backend user authentication. Anyone who knows a guide URL can see it; do not include sensitive implementation details in research prompts.
- Generated guide persistence uses a local JSON file rather than multi-instance storage. A volume is required in production; multiple replicas need a database and locking.
- Research call might take time or fail due to provider docs changes, web-search coverage, API credentials, upstream timeouts or rate limits. Source reachability checks can be blocked by sites.
- Summarization/model output may still be wrong despite sources. Important regulatory or security requirements must be verified against provider console/official policies before launch.
- In-memory rate limiter resets when the server restarts; for public use add proper authentication, distributed rate limiting, request budgets, logs, review/audit state and scheduled source refresh.
- Per-step check state is stored locally, not shared between users.
- Automated provider-console setup attempts and browser agents are intentionally out of scope without explicit authorized credentials; they would require an authenticated, permissioned computer-use workflow.
- The full 100-app library was not built. A production rollout should prioritize adoption demand, add periodic source rechecks, allow feedback/errata, and use an editorial review queue for generated guides.
