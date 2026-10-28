# Source audit — October 28, 2026

This is a documentation audit, **not** a claim of authenticated provider setup or approval.

| Provider | What first-party sources support | Change or critical nuance | What was NOT verified |
|---|---|---|---|
| GitHub | Classic OAuth app self-registration under Developer settings; GitHub explicitly recommends evaluating GitHub Apps for fine-grained repo access and independent app actions. | An OAuth app does not by itself require an invented universal provider review time. Organization-specific OAuth restrictions are separate. | A real client registration, consent, or org-specific approval. |
| Google APIs | Sensitive scopes typically take 3–5 business days; restricted scopes may entail a third-party security assessment and weeks; domain, scope justification and demonstration requirements differ by path. | A single “Google OAuth approval time” is misleading. Scope and exceptions determine obligations. | Exact scopes for a specific agent, live verification, security assessor cost. |
| Slack | Unlisted distribution is distinct from commercial-scale Marketplace listing. As of July 2026, submission requires 10 active installed workspaces, maintained during review. Published preliminary feedback upper bound is 10 business days, functional review up to 10 weeks for new listings. | **10 installs** and **up to 10 weeks** are important launch blockers; they do not apply to every private/pilot install. | Live installation/admin restriction and present submission queue. |
| Notion | Public connections use OAuth without mandatory Marketplace listing; installation scope is either Any workspace or Selected workspaces only and is immutable; optional Marketplace initial feedback expected in 5–10 business days. | Corrected the draft to identify an irreversible scope choice and a documented initial review response window, not guaranteed approval. | A provider-console setup, real reviewer turnaround, or authorized pages in a real tenant. |

## Official sources

- GitHub registration: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- GitHub authorization: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Google sensitive scopes: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Google restricted scopes: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Google policy compliance: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Slack distribution: https://docs.slack.dev/app-management/distribution/
- Slack review process: https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/
- Slack installation threshold update: https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement/
- Notion public connection setup: https://developers.notion.com/guides/get-started/public-connections
- Notion auth flow: https://developers.notion.com/guides/get-started/authorization
- Notion Marketplace listing: https://developers.notion.com/guides/get-started/marketplace-listing
- Managed OAuth versus custom: https://docs.composio.dev/toolkits/managed-auth

## Engineering tests

Run `npm test` from the project directory. The integration test starts a real Web2Guide HTTP server, spins up a mock Responses API, submits an unfamiliar provider, reads SSE progress and completion, checks persistence, retrieves the generated guide and confirms the deep link. **That test does not exercise OpenAI's real web search or external provider setup.**
