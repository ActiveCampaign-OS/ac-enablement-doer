# ac-enablement-doer

The Enablement "Do-er" agent: owns reactive, one-off training requests end-to-end so the
human enablement team doesn't have to. Stakeholders submit a request; the agent assesses it
against **the Design to Impact Spine** (Global Enablement's shared framework, embedded in
`lib/spine/framework.ts`), asks scoping questions until the Spine's bar is met (business
goal, observable see/do behaviours, gap diagnosis), recommends the smallest deliverable that
moves the behaviour, and runs a confirm loop. Rise courses and Solidroad simulations always
route to a human build queue (Solidroad has no public API; Rise is gated by policy).

**V1 scope:** intake → assessment → recommendation → confirm/decline → operator handoff
queue. **Phase 2 (planned):** autonomous generation of job aids, manager guides, and PPTX
decks; agent-written build specs for Solidroad/Rise handoffs.

## Lifecycle

```
SUBMITTED → ASSESSING ⇄ NEEDS_INFO → RECOMMENDED → CONFIRMED            (autonomous types)
                                                  ↘ HANDOFF_REQUIRED → APPROVED → DELIVERED
DECLINED (requires category + reason — feeds future assessments as negative examples)
```

- Transitions are enforced by `lib/state-machine.ts` (illegal → 422); every transition writes
  a `RequestAction` audit row with the SSO actor.
- Autonomy (`AUTONOMOUS` vs `HUMAN_HANDOFF`) is derived **server-side** from the deliverable
  type — never from LLM output.
- Assessment versions are capped at 4 per request, then the ops channel is asked to step in.

## Launch checklist (admin actions)

1. **Outcome slugs** — register in Spark → Settings → Outcomes (or every emit 422s):
   `training-request-assessed`, `training-request-confirmed`, `training-handoff-created`,
   `training-asset-delivered`.
2. **Configuration** (app Settings → Secrets):
   - `SLACK_CHANNEL_ID` — ops channel ID for submitted/recommended/confirmed/handoff/nudge
     notifications. Slack is accessed through the auto-approved ACOS connection; do not create
     or set an incoming webhook. App works without a channel ID; notifications just no-op.
   - `OPERATOR_ALLOWLIST` — comma-separated operator emails. **Unset = everyone is an
     operator** (opt-in enforcement, same pattern as `WRITE_ALLOWLIST`).
   - `SPINE_CONFLUENCE_PAGE_ID` (optional) — page id of the Spine doc to enable the weekly
     refresh cron. Also needs the `confluence` vendor appAccess grant (check
     `/api/diagnostics/confluence`).
   - **Jira creation** — submissions create a `Global Enablement Programming Request` in
     project `GEP` through the ACOS Jira connection. The deploy files the required
     `jira:create-issue` access request; an ACOS Data admin must approve it before the first
     ticket can be created. `JIRA_PROJECT_KEY` and `JIRA_ISSUE_TYPE` can override the defaults.
     The current ACOS Jira catalog does not expose issue-update, watcher, or request-participant
     writes, so follow-up answers remain in the linked request until those managed endpoints are
     added and approved.
3. **Spine content** — already embedded from the 2026-07-14 Confluence export. When the page
   changes, either enable the refresh cron (above) or re-paste into `lib/spine/framework.ts`
   and bump `SPINE_VERSION`.

## Local dev

```bash
createdb ac_enablement_doer
# .env.local: DATABASE_URL, CRON_SECRET=dev, NEXT_PUBLIC_APP_URL=http://localhost:3000,
#             plus the Settings → Local Development snippet (ACOS_*, CF_ACCESS_*, ANTHROPIC_*)
npm install && npx prisma migrate deploy && npm run dev
# simulate SSO:
curl -H "x-auth-request-email: you@activecampaign.com" localhost:3000/api/me
```

Note: locally the Anthropic CrabTrap proxy sits behind Cloudflare Access — the client in
`lib/spine/assess.ts` attaches `CF-Access-Client-Id/Secret` headers automatically when those
env vars are present (they come with the local-dev snippet). In production the proxy URL is
in-cluster and the headers are omitted.

## Diagnostics (declared as hooks-bypass webhooks — curl-able without SSO)

- `/api/diagnostics/acos` — env + vendor list with appAccess flags
- `/api/diagnostics/confluence` — access check; `?pageId=…` proves get-page-body + parser
- `/api/diagnostics/outcomes` — env review; `?emit=1` fires a real test outcome
- `/api/diagnostics/spine` — which framework copy is live (source/version/hash/size)

## Architecture notes

- Cloned from `ac-doc-auditor` patterns: `lib/acos-client.ts` (raw gateway client — the
  official SDK's `github:` dep breaks Spark Docker builds), review-gate state machine,
  dismiss-with-reason feedback loop, best-effort Slack/outcomes.
- Outcomes are **single-object POSTs only** to the injected `OUTCOMES_URL` (batch envelopes
  422 silently; the public ac-spark.com URL is silently eaten by Cloudflare Access).
- The assessment engine (`lib/spine/assess.ts`) sends the framework as a cached system block
  (`cache_control: ephemeral`), parses with a tolerant JSON parser, and coerces any off-menu
  deliverable type to `OTHER`.
