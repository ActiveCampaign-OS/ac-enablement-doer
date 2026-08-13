# Enablement Do-er: August 3 Meeting Actions

This action register distinguishes agreed direction from decisions that still need Enablement Operations input.

## Agreed direction

- The app is the front door for support needs, not a form that presumes training is the answer.
- The agent should triage between self-service support, autonomous asset creation, and human Enablement work.
- Internal Enablement staff need an operator queue; requesters should see only their own requests.
- A reusable-content check should happen early enough to avoid creating duplicate training or job aids.
- Rise and Solidroad remain human handoffs. Job aids, manager guides, and deck storyboards can be drafted by the app and reviewed by an operator.

## Actions started

| Action | Owner | Status | Evidence / next step |
| --- | --- | --- | --- |
| Restrict the queue and request records to the requester or an Enablement operator. | Brandon | **Implemented** | `OPERATOR_ALLOWLIST` now controls the internal queue, all-request view, request-detail reads, thread posts, and request actions. Configure the secret with the Enablement operator emails before the requester pilot. |
| Make the operator queue the human-in-the-loop workspace. | Enablement Ops | **Ready for configuration** | The queue already groups human handoffs, approvals, stakeholder waits, and active asset builds. Decide the initial operator roster and set `OPERATOR_ALLOWLIST`. |
| Publish an operations-oriented backend explanation and visual. | Brandon | **Complete** | See `docs/ops-backend-overview.md` and the shared workflow visual. |

## Decisions needed from Enablement Operations

| Decision | Why it matters | Proposed default |
| --- | --- | --- |
| When should Jira be created? | This determines whether Jira tracks every support need or only work that needs Enablement ownership. | Create a Jira item for confirmed human handoffs and review-ready autonomous assets; keep pure self-service routes in the app unless reporting requires a Jira record. |
| Which users are operators? | Controls who can see the internal queue, approve drafts, assign work, edit assets, and perform handoff actions. | Start with Emily, Erin, Caitlyn, Bailey, and the active Enablement delivery owners; review after the pilot. |
| What is the first content registry? | The agent needs a trusted corpus to suggest an existing resource before generating a new one. | Emily's structured Google Drive plus the source-of-truth Confluence locations; include Osmo links where the supporting documentation points to them. |
| Should intake begin as a form, guided chat, or both? | Guided chat can gather context progressively, while the current form gives repeatable structured data. | Keep the form for the pilot and add a guided “help me diagnose” entry point after the content-registry rules are agreed. |

## Technical dependencies and owners

| Dependency | Owner / ask | Current state |
| --- | --- | --- |
| Jira Service Management create contract | Spark / ACOS: expose JSM customer-request creation plus service-desk, request-type, and required-field discovery. | **Shipped August 5.** The app now uses the native JSM SDK methods; approve the three Spark endpoint grants before the pilot. `JIRA_AUTOCREATE_ENABLED` stays `false` until then. |
| Jira follow-up sync | Brandon: keep follow-up context on the existing JSM request without exposing operator notes to the requester. | **Implemented, unverified.** Stakeholder messages become public JSM comments and operator messages internal comments after initial creation; verify on the guarded pilot. |
| Content registry / duplicate prevention | Emily and Enablement Ops: identify canonical Drive/Confluence folders, owners, update expectations, and what counts as approved/current. | **Discovery needed.** Glean can search permission-trimmed connected content, but it is not yet an authoritative registry or automatic publishing path. |
| Deck delivery | Brandon + Enablement Ops: validate the native renderer and request an approved Google Slides creation path only if direct Drive publishing becomes necessary. | **Implemented, pending live verification.** The app produces a review-ready storyboard, in-app preview, and editable PPTX. It does not publish to Google Slides. |
| Handoff and maintenance | Erin / Enablement Ops | **Ready after configuration.** Confirm queue roster, operating cadence, and pilot escalation path. |

## Pilot exit criteria

Before replacing the existing Jira portal, prove one synthetic request end to end:

1. Requester can submit and see only their own record.
2. An operator can see the internal queue, review, and approve the route.
3. The app creates the correct GEP Jira record with full intake and assessment context.
4. Follow-up context can be added to the Jira record or a documented interim process is accepted.
5. The configured Enablement Slack channel receives the expected notification.
6. The resulting asset is reviewable, access-controlled, and deliverable to the requester.
