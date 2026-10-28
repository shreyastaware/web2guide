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

- Check the three numbers up top: setup time, approval and wait, difficulty.
- Pick your use case when it changes the path. Review steps hide when you don't need them.
- Work through the numbered steps and tick each one off. Progress is saved in this browser only and doesn't verify anything on the provider side.
- Copy the link to share, or export the guide as Markdown.

Every guide shows a **setup time** and an **approval wait**, always marked as estimates (`~`, “est.”). A documented provider duration wins; otherwise the guide's effort estimate is used, then a typical range by difficulty or stage. The live research agent is required to return these estimates. Treat them as planning numbers, not provider commitments.

Each guide is a short numbered list of steps. Every step shows who does it (🙋 You, 🤖 Agent, 🤝 Agent + you) and roughly how long it takes. Open a step to see the actions, values to copy, a “Done when” check, a link to the right dashboard, and a 😵 Stuck? toggle for blockers. Troubleshooting and sources sit at the bottom, collapsed.

The library can be filtered by setup time (under 1 h, 1–3 h, 3 h+), complexity, and approval.

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
