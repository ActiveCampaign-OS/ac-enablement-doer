# Spark / ACOS request: enable Jira Service Management customer requests for GEP

**Decision requested:** Approve and ship the Jira REST endpoint update below in `acos-data`. This is a **REST gateway** change, not a Jira MCP request. Do not enable `JIRA_AUTOCREATE_ENABLED` or create a test issue as part of this change.

## Why this is needed

Enablement Do-er files work in **GEP / Global Enablement Programming**, which is a Jira Service Management (JSM) project. The current generic `jira:create-issue` endpoint cannot safely create the portal request because the app cannot discover the GEP service desk, its request type, or the current required portal fields before a write.

The app currently keeps `JIRA_AUTOCREATE_ENABLED=false` and records a paused Jira sync. This avoids creating incomplete or empty records. The requested endpoints let it resolve the live portal contract first, create one complete customer request after a draft or confirmed handoff is ready, then synchronize later context to the same request.

## Copy/paste implementation request

```text
Update the jira vendor in acos-data to support Jira Service Management (JSM)
customer requests for the Enablement Do-er app.

This is a REST vendor endpoint change. Do not add or require Jira MCP.
Keep the existing generic create-issue endpoint unchanged for its existing consumers.

Add these read endpoints in src/vendors/jira/endpoints.ts, using the existing Jira
adapter and endpoint-config conventions for validation, pagination, cache policy,
PII redaction, and error handling:

1. list-service-desks
   - Upstream: GET /rest/servicedeskapi/servicedesk
   - Params: start?: integer, limit?: integer
   - Cache: persistent metadata; short/medium TTL
   - Returns: JSM service desks, including id and project identifiers.

2. list-service-desk-request-types
   - Upstream: GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype
   - Params: serviceDeskId: string (required), start?: integer, limit?: integer
   - Cache: persistent metadata; short/medium TTL
   - Returns: request types, including id, name, and description.

3. get-service-desk-request-type-fields
   - Upstream: GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/{requestTypeId}/field
   - Params: serviceDeskId: string (required), requestTypeId: string (required)
   - Cache: persistent metadata; short/medium TTL
   - Returns: every portal field needed to create the request, including fieldId,
     name, required, validValues, and any default values.

Add these write endpoints with no response cache and gateway idempotency enabled.
Use the established Jira write-endpoint PII-redaction convention for requester
identity, participant account IDs, and free-text field values:

4. create-customer-request
   - Upstream: POST /rest/servicedeskapi/request
   - Params:
       serviceDeskId: string (required)
       requestTypeId: string (required)
       requestFieldValues: Record<string, unknown> (required; keys must be
         validated against the fields returned by endpoint 3)
       raiseOnBehalfOf?: string
       requestParticipants?: string[]
   - Return the JSM CustomerRequestDTO unchanged enough for callers to persist
     issueId, issueKey, requestTypeId, serviceDeskId, status, and links.
   - Do not silently fall back to core Jira create-issue when JSM validation fails.

5. get-customer-request
   - Upstream: GET /rest/servicedeskapi/request/{issueIdOrKey}
   - Params: issueIdOrKey: string (required)
   - Cache: volatile/short TTL.
   - Returns: the JSM CustomerRequestDTO for post-write verification and recovery.

6. add-customer-request-comment
   - Upstream: POST /rest/servicedeskapi/request/{issueIdOrKey}/comment
   - Params: issueIdOrKey: string (required), body: string (required), public: boolean (required)
   - Use this for follow-up answers and delivery context. Redact body from audit logs.

7. add-customer-request-participants
   - Upstream: POST /rest/servicedeskapi/request/{issueIdOrKey}/participant
   - Params: issueIdOrKey: string (required), accountIds: string[] (required)
   - Use this to add the requester after account-id lookup where the JSM request
     does not already make them a participant. Redact accountIds from audit logs.

Update the endpoint definitions in src/vendors/jira/endpoints.ts.
Update the Jira adapter's executeEndpoint() and URL builder in
src/vendors/jira/adapter.ts for the path parameters and request bodies above.
Update prisma/seed.ts to upsert all endpoint definitions and keep the Jira vendor's
active endpoint list in sync. Update src/vendors/registry.ts and src/worker.ts only
if this Jira endpoint registration pattern requires it.

For upstream 400 responses, preserve the upstream HTTP status and surface a
sanitized form of Jira's errorMessages and field-level errors in the standard ACOS
error envelope. Never put credentials or raw request bodies in the error/audit log.
```

## Acceptance checks for Shay / ACOS

1. In **Data → Vendors → Jira**, the seven endpoint slugs appear with the methods and paths above.
2. The Sandbox can read service desks, then request types and required fields for the selected GEP desk/type. This must happen before any create test.
3. A deliberately incomplete sandbox create returns a sanitized JSM field error, not a generic `400` without details.
4. A single approved synthetic create returns an issue key/URL, and retrying it with the same gateway idempotency key does not create a duplicate request.
5. `get-customer-request`, one internal comment, and participant addition can be verified against that synthetic request.
6. The existing generic `jira:create-issue` continues to work unchanged for its current consumers.

## After the gateway is shipped

Enablement Do-er will make a small, separate app change:

1. Add the new Jira write endpoint slugs to `spark.json` under `acosData.write`, then obtain the resulting app-access approvals.
2. Resolve the GEP desk/type/field metadata at runtime, map the full intake into `requestFieldValues`, and create JSM requests only at the existing late lifecycle gate.
3. Persist the returned Jira key and clickable URL, validate the request with `get-customer-request`, and add the requester as a participant when needed.
4. Keep `JIRA_AUTOCREATE_ENABLED=false` until one explicit synthetic end-to-end pilot proves Jira creation and Slack delivery.

## Scope boundary

This request does not change Jira project configuration, enable a user-facing portal, create a Jira issue, or publish an asset. It only gives the managed ACOS gateway the JSM contract required for the app to perform a safe, audited pilot later.

## Reference

The required JSM creation and discovery paths are documented by Atlassian's Jira Service Management REST API:

- [Customer requests](https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/)
- [Request types and fields](https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-requesttype/)
- [Service desks](https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-servicedesk/)
