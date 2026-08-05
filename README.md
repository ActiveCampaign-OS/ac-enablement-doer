# ac-enablement-doer

The Enablement "Do-er" agent: diagnoses reactive, one-off support needs before proposing an
intervention. Stakeholders submit a request; the agent assesses it
against **the Design to Impact Spine** (Global Enablement's shared framework, embedded in
`lib/spine/framework.ts`), asks scoping questions until the Spine's bar is met (business
goal, observable see/do behaviours, gap diagnosis), recommends the smallest deliverable that
moves the behaviour, and runs a confirm loop. Rise courses and Solidroad simulations always
route to a human build queue (Solidroad has no public API; Rise is gated by policy).

**Current scope:** diagnosis-first intake → assessment → route recommendation → durable asset build →
operator review → delivery. Recommendations visibly route needs to self-serve guidance, a coaching
asset, an Enablement partnership, or a non-training resolution. Job aids and manager guides are
generated autonomously as review-ready Markdown drafts. Decks are generated as complete slide
storyboards with an in-app preview and downloadable JSON source. Rise courses and Solidroad
simulations remain explicit human handoffs.

## Lifecycle

```
SUBMITTED → ASSESSING ⇄ NEEDS_INFO → RECOMMENDED → GENERATING → DRAFT_READY → APPROVED → DELIVERED
                                                 ↘ HANDOFF_REQUIRED ───────────────────────→ APPROVED → DELIVERED
GENERATING → CONFIRMED (build failure; operator may retry)
DECLINED (requires category + reason — feeds future assessments as negative examples)
```

- Transitions are enforced by `lib/state-machine.ts` (illegal → 422); every transition writes
  a `RequestAction` audit row with the SSO actor.
- Autonomy (`AUTONOMOUS` vs `HUMAN_HANDOFF`) is derived **server-side** from the deliverable
  type — never from LLM output.
- Assessment versions are capped at 4 per request, then the ops channel is asked to step in.
- Asset builds are durable `AssetBuild` records. The `asset-builder` Spark worker claims them
  atomically, renews a heartbeat, requeues stale work, and writes private artifacts to the
  Spark-provisioned S3 bucket. Redis and request-bound background work are not used for builds.
- The worker is bundled into Next.js's standalone production image during `npm run build` and
  starts with Node directly. On a first deployment it waits for Prisma migrations instead of
  crash-looping while the web process finishes database setup.

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
   - **Glean MCP** — declared in `spark.json` through ACOS-Data; do not add a Glean bearer token
     to Spark secrets or call the Glean endpoint directly. The managed MCP connection acts as the
     signed-in user and is permission-trimmed to their Glean access. `/api/diagnostics/glean`
     verifies catalog readiness without opening a user-scoped MCP session.
   - `SPINE_CONFLUENCE_PAGE_ID` (optional) — page id of the Spine doc to enable the weekly
     refresh cron. Also needs the `confluence` vendor appAccess grant (check
     `/api/diagnostics/confluence`).
  - **Jira Service Management (pilot gated)** — the app resolves GEP's live service desk,
    request type, and required portal fields, then creates a JSM customer request only after the
    existing late lifecycle gate. The app declares `jira:create-customer-request`,
    `jira:add-customer-request-comment`, and `jira:add-request-participant` in `spark.json`;
    approve those endpoint grants in Spark → Data → Access before a pilot. Keep
    `JIRA_AUTOCREATE_ENABLED=false` until the grants are active and one guarded synthetic request
    proves Jira creation plus Slack delivery. `JIRA_PROJECT_KEY` and `JIRA_REQUEST_TYPE` override
    the defaults (`JIRA_ISSUE_TYPE` remains a compatibility fallback). New requests are explicitly
    raised on behalf of `evangilder@activecampaign.com` by default; override that reporter with
    `JIRA_DEFAULT_REPORTER_EMAIL`. The original requester is included as a participant at creation
    and verified again afterward. `JIRA_COMMENT_SYNC_ENABLED=false` is an emergency-only switch to
    pause Jira comment writes without disabling already-created records.
   - **Asset storage** — no secret or AWS credentials are required. The
     `@aws-sdk/client-s3` dependency makes Spark provision a private bucket and inject
     `S3_BUCKET`; the app uses its pod IAM role. Artifacts are only downloadable by the
     requester or an operator through the SSO-gated app route.
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
- `/api/diagnostics/glean` — safe ACOS-Data Glean catalog/MCP readiness; does not open a user-scoped MCP session or run an agent
- `/api/diagnostics/integrations` — safe Jira + Slack readiness: ACOS env, vendor grants,
  Jira project/issue type, and whether `SLACK_CHANNEL_ID` is configured; creates nothing
- `/api/diagnostics/confluence` — access check; `?pageId=…` proves get-page-body + parser
- `/api/diagnostics/outcomes` — env review; `?emit=1` fires a real test outcome
- `/api/diagnostics/spine` — which framework copy is live (source/version/hash/size)

## Architecture notes

- Cloned from `ac-doc-auditor` patterns: `lib/acos-client.ts` (raw gateway client for existing
  generic vendor calls) plus the pinned `@activecampaign-os/data-client` SDK for JSM request
  methods, review-gate state machine,
  dismiss-with-reason feedback loop, best-effort Slack/outcomes.
- Outcomes are **single-object POSTs only** to the injected `OUTCOMES_URL` (batch envelopes
  422 silently; the public ac-spark.com URL is silently eaten by Cloudflare Access).
- The assessment engine (`lib/spine/assess.ts`) sends the framework as a cached system block
  (`cache_control: ephemeral`), parses with a tolerant JSON parser, and coerces any off-menu
  deliverable type to `OTHER`.
- Confirmation of an autonomous type creates a `QUEUED` asset build in the same transaction that
  changes the request to `GENERATING`. The worker snapshots form inputs, stakeholder messages,
  the latest assessment, and successfully retrieved explicit Confluence links before drafting.
  Other links are never treated as fetched evidence. It creates the Jira issue only after the
  draft is ready; human-only handoffs create Jira when the scope is confirmed. The initial Jira
  description contains the intake, assessment, conversation, asset summary, and an authenticated
  download link instead of an empty early ticket.
- Job aids and manager guides are stored as both editable Markdown and downloadable `.docx` files.
  Operator edits rebuild both artifacts so the native document stays current.
- A deck is intentionally delivered as a review-ready slide storyboard until a Spark-deployable
  editable PPTX renderer is available. The Codex-only `@oai/artifact-tool` package is not
  installable in the Spark image, so the app does not pretend to export a PowerPoint file it
  cannot render and validate in production.
- **Data Wizard evidence research** — operators can copy a privacy-minimized, request-specific
  brief into the StratOps Data Wizard from a request record. It explicitly asks Data Wizard to
  consult canonical BI definitions and approved dashboards before proposing a read-only Snowflake
  query. The app does not call Glean or Snowflake automatically; recording the handoff writes an
  audit event with `queryExecuted: false` so research remains reviewable until an API contract and
  approved access path are available.
