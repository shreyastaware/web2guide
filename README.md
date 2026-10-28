# Web2Guide

Generate actionable OAuth setup guides from an app name or website. Each guide separates account preparation, app registration, configuration, testing, and any distribution or approval requirements.

## Run locally

Requires Node.js 20 or later. There are no runtime dependencies or build steps.

```sh
npm start
# http://localhost:3001
```

The generator is the landing page. The navigation contains **Web 2 Guide Generator** and **Checkout Generated Guides**. Entering an app already in the library opens its saved guide. The bundled guides cover GitHub, Google APIs, Slack, and Notion.

For new providers, configure a server-side API key:

```sh
export OPENAI_API_KEY="your-own-key"
export OPENAI_MODEL="gpt-5-mini" # optional
npm start
```

The key is never requested or exposed in the browser. Without it, saved guides remain available and the generator can open existing apps. New-provider research uses the OpenAI Responses API with web search and can incur API charges.

## Follow a guide

- Read the compact overview, prerequisites, and approval path.
- Choose your intended use when it changes the requirements. Review-only work is hidden for paths that do not require it.
- Follow the expandable checklist. Each step contains a dashboard location, short actions, relevant configuration values, a success check, and documentation links.
- Mark actions complete. Progress and use-case choices are saved on this browser; they do not verify provider-side configuration, distribution, or approval.
- Open troubleshooting and references when needed. Copy the shareable URL or export the selected path as Markdown.

Hands-on time and external review wait are separate. A documented setup time is shown when a source supports it; otherwise the engineering effort estimate is shown and labeled **Estimate, not from provider docs**. Review waits are never estimated: without a source they are **Unknown**. Unknown approval requirements remain unknown.

Each guide shows what an agent can do and where you need to take over, and every step is marked **You**, **Agent**, or **Agent + you** with its estimated time. The header states whether a guide was curated from official docs or produced by agent research.

## Routes and storage

| Route | Purpose |
| --- | --- |
| `/` | Single-input guide generator |
| `/guides` | Searchable guide library |
| `/guides/:slug` | Shareable guide and checklist |
| `/research` | Preserved generator alias |
| `GET /api/health` | Health and generation availability |
| `GET /api/guides` | Saved guide summaries |
| `GET /api/guides/:slug` | Full guide |
| `POST /api/research` | Guide generation with SSE progress |

The app uses a single Node HTTP process and buildless HTML, CSS, and JavaScript. Curated data lives in `data/guides.json`; research results persist in `DATA_DIR/generated.json` (default: `data/generated.json`). The structured guide fields are additive. Older saved guides continue to render, and the original `authpath_checklists` storage key preserves existing progress.

New guides include structured steps, source-linked approval and timing details, and optional use-case branches. Model text is escaped before rendering. Source URLs are filtered and checked for reachability; reachability is not independent verification of every claim.

## Verify

```sh
npm test
```

Tests cover input validation, source filtering, structured guide normalization, legacy data compatibility, stage ordering, conditional approval steps, progress calculations, HTTP routes, and generation/persistence using a mocked model API.

Live research requires a valid API key and network access. Automated tests do not create real provider apps, exchange real OAuth credentials, or submit provider reviews.

## Deploy

Use the included Dockerfile or any Node-capable host. Set `PORT` if required by the host. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` as server secrets. Mount persistent storage and set `DATA_DIR` to retain generated guides across deploys.

There is no user authentication. Guides are accessible to anyone with the URL. JSON-file persistence is intended for one server process; multiple replicas require coordinated storage. The in-memory generation limit is six requests per IP per hour and resets on restart.

## License

GNU Affero General Public License, version 3.0. See [LICENSE](LICENSE).
