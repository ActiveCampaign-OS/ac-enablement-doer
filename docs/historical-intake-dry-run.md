# Historical intake dry run

This aggregate-only analysis was derived locally from the legacy Global Enablement
form export on 2026-07-24. The source CSV is not committed. Requester identities,
request titles, free-text responses, stakeholder names, and links are intentionally
excluded.

## Scope and limitations

- **135** historical records were parsed successfully.
- The export combines several generations of the manual form. A blank field can
  mean the question did not exist on that version, not that a requester omitted it.
- These signals are for pilot design and queue planning only. They are not a
  substitute for the current diagnosis-first assessment and must not trigger
  autonomous delivery or live Jira/Slack side effects.

## Legacy format signals

| Request-format signal | Records |
| --- | ---: |
| Self Guided Training | 47 |
| Hybrid Learning (live + self guided) | 26 |
| Live Training | 13 |
| Internal Knowledge Base Article | 10 |
| Documentation | 8 |
| Information Sharing | 4 |
| Other, mixed, or blank format signals | 27 |

The historical format selection is a requester preference, not a validated
solution. The first three categories account for 86 of 135 records and should not
be auto-routed to course development. They need the current diagnosis to distinguish
knowledge, process, environment, ownership, and motivation gaps.

## Historical field coverage

| Legacy question | Nonblank records | Interpretation |
| --- | ---: | --- |
| Topic / enablement situation | 123 | Strong starting context across the primary form version. |
| Required audience | 118 | Usually usable for initial scope. |
| Stakeholders | 122 | Often present, but not proof of SME approval. |
| Workforce-management notice | 101 | Operational scheduling signal, not an outcome measure. |
| Communication preferences | 104 | Distribution preference, not an instructional decision. |
| Existing documentation or content | 3 | Insufficient for autonomous factual asset drafting. |
| Desired outcome | 4 | Insufficient for reliable impact diagnosis. |
| Success measures / related dashboards | 3 | Insufficient for impact claims or measurement plans. |
| Desired launch date | 4 | Sparse and form-version dependent. |

## Pilot implications

1. Start with a narrow documentation or knowledge-base request that has no learner
   distribution obligation and can be clearly labelled a controlled pilot.
2. Treat legacy records without source content as **needs SME confirmation**. The
   asset builder may draft structure and assumptions, but must not invent process
   facts.
3. Use the new form's business impact, success measures, desired behavior, and
   accountability fields to capture the evidence missing from the historical process.
4. Use the operator-controlled Data Wizard brief only after a request has a concrete
   business question. Prefer canonical BI assets and read-only analysis; record any
   research handoff in the request timeline.
5. Keep historical replays dry-run until an operator explicitly approves the exact
   request, the external side effects, and any sensitive data needed for research.
