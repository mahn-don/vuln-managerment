# REST API Reference

## Conventions

- Base path: `/api/v1`
- Authentication: NextAuth session cookie, except the Jira webhook
- Request and response media type: `application/json`
- Multipart exception: `/imports/upload`
- Pagination defaults vary by endpoint; list endpoints return `meta`
- Timestamps are ISO 8601 strings
- UUIDs identify database records; applications, assessments, and vulnerabilities also have display keys

Successful response:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "total": 125,
    "page": 1,
    "limit": 25,
    "pages": 5
  }
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": []
  }
}
```

Common status codes are `200`, `201`, `400`, `401`, `403`, `404`, `409`, `415`, `429`, and `500`.

## Authentication, CSRF, and Scope

All `/api/v1` routes except `/webhooks/jira` resolve the session server-side. Role permission is checked before the handler runs. Application, assessment, vulnerability, dashboard, search, import, and export results are also filtered by the caller's effective business-unit, ownership, or remediation scope.

Mutating requests must send `Content-Type: application/json`, even when the action has no body. The Excel upload must send `multipart/form-data` and `X-Requested-With: XMLHttpRequest`.

## Applications

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/applications` | Paginated application list |
| `POST` | `/applications` | Create an application |
| `GET` | `/applications/export` | Stream scoped CSV export |
| `GET` | `/applications/{id}` | Application detail |
| `PUT` | `/applications/{id}` | Update application metadata |
| `DELETE` | `/applications/{id}` | Archive an application |
| `GET` | `/applications/{id}/security-summary` | Security posture summary |
| `GET` | `/applications/{id}/timeline` | Combined lifecycle timeline |
| `GET` | `/applications/{id}/assessments` | Related assessments |
| `GET` | `/applications/{id}/vulnerabilities` | Related vulnerabilities |
| `GET` | `/applications/{id}/aliases` | List aliases |
| `POST` | `/applications/{id}/aliases` | Add an alias |
| `DELETE` | `/applications/{id}/aliases/{aliasId}` | Delete an alias belonging to the application |
| `GET` | `/applications/{id}/owners` | List owners |
| `POST` | `/applications/{id}/owners` | Add an owner |

Application list parameters include `page`, `limit`, `sort`, `order`, `search`, `status`, `criticality`, `businessUnitId`, `internetFacing`, `hasOpenVulns`, `assessmentOverdue`, and `neverAssessed`.

## Assessments

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/assessments` | Paginated assessment list |
| `POST` | `/assessments` | Create an assessment |
| `GET` | `/assessments/{id}` | Assessment detail |
| `PUT` | `/assessments/{id}` | Update editable metadata |
| `PATCH` | `/assessments/{id}/status` | Apply a workflow transition |
| `PATCH` | `/assessments/{id}/assign` | Assign an engineer |
| `GET` | `/assessments/{id}/closure-readiness` | Which closure checks pass, and which block the close |
| `GET` | `/assessments/{id}/history` | Status history |
| `GET` | `/assessments/{id}/vulnerabilities` | Findings produced by the assessment |

List parameters include `page`, `limit`, `sort`, `order`, `search`, `status`, `assessmentTypeId`, `assigneeId`, `applicationId`, `priority`, `slaStatus`, and `overdue`.

## Vulnerabilities

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/vulnerabilities` | Paginated vulnerability list |
| `POST` | `/vulnerabilities` | Create a vulnerability and calculate SLA |
| `GET` | `/vulnerabilities/{id}` | Vulnerability detail |
| `PUT` | `/vulnerabilities/{id}` | Update editable metadata |
| `PATCH` | `/vulnerabilities/{id}/status` | Apply a workflow transition |
| `GET` | `/vulnerabilities/{id}/history` | Status history |
| `GET` | `/vulnerabilities/{id}/risk-acceptance` | List risk acceptances |
| `POST` | `/vulnerabilities/{id}/risk-acceptance` | Accept risk as the authenticated approver |
| `POST` | `/vulnerabilities/{id}/risk-acceptance/{acceptanceId}/decision` | Approve or reject a requested acceptance |

List parameters include `page`, `limit`, `sort`, `order`, `search`, `severity`, `status`, `slaStatus`, `applicationId`, `assigneeId`, `fixOwnerId`, `assessmentId`, `cveId`, and `cweId`.

## Imports

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/imports` | Paginated import history |
| `POST` | `/imports/upload` | Upload an XLSX and optionally generate a preview |
| `GET` | `/imports/{id}` | Import and first preview page |
| `GET` | `/imports/{id}/preview` | Import preview |
| `POST` | `/imports/{id}/confirm` | Apply included preview rows |
| `POST` | `/imports/{id}/rollback` | Roll back a completed import within 24 hours |

The upload form fields are `file` and optional `columnMapping`, where `columnMapping` is a JSON object mapping worksheet header names to internal field names.

## Jira and Mapping

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/integrations/jira` | Return non-secret Jira configuration status |
| `POST` | `/integrations/jira/test` | Test Jira connectivity |
| `POST` | `/integrations/jira/sync` | Start a manual sync |
| `GET` | `/integrations/jira/sync-history` | Paginated synchronization history |
| `GET` | `/integrations/jira/writeback` | Pending write-back actions |
| `POST` | `/integrations/jira/writeback` | Queue a write-back action |
| `POST` | `/integrations/jira/writeback/{id}` | Approve or reject a queued action |
| `GET` | `/mappings` | Mapping review queue |
| `GET` | `/integrations/jira/triage` | Triage backlog counts |
| `POST` | `/integrations/jira/triage` | Triage a batch of pending tickets |
| `POST` | `/mappings/{id}/confirm` | Confirm suggested application |
| `POST` | `/mappings/{id}/override` | Select another application |
| `POST` | `/mappings/{id}/reject` | Reject the mapping |
| `POST` | `/mappings/{id}/reanalyze` | Re-run triage for one ticket |

### Jira Webhook

`POST /webhooks/jira` does not use a session cookie. It requires:

```http
X-Webhook-Secret: <JIRA_WEBHOOK_SECRET>
Content-Type: application/json
```

Payloads over 1 MB are rejected. Supported events are issue created, updated, and deleted.

## Reporting and Search

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dashboard/executive` | Scoped posture KPIs and charts |
| `GET` | `/dashboard/operations` | Scoped operational KPIs and workload |
| `GET` | `/analytics?months=12` | Trend analytics, bounded to 24 months |
| `GET` | `/search?q=...&limit=20` | Scoped global search |
| `GET` | `/nav-counts` | Scoped sidebar counts |

Dashboard endpoints accept optional `from` and `to` parameters in `YYYY-MM-DD` format.

## AI-Assisted Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/ai/query` | Ask a predefined security-data question with optional AI fallback |
| `GET` | `/ai/brief` | Generate or return the cached scoped daily brief |
| `POST` | `/ai/analyze-ticket` | Extract structured ticket information |
| `POST` | `/ai/recommend-assignment/{assessmentId}` | Score assignment candidates |

AI query requests are bounded per minute and per user/day. External vendor calls occur only when explicitly enabled. The natural-language query service does not execute generated SQL.

## Administration

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users` | List users |
| `GET` | `/users/me` | Current user profile |
| `PUT` | `/users/{id}/role` | Change a user's role |
| `GET` | `/users/assignable` | Users eligible to take an assessment |
| `GET` | `/sla/rules` | List SLA rules |
| `POST` | `/sla/rules` | Create an SLA rule |
| `GET` | `/settings/ai` | AI provider settings, without the token |
| `PUT` | `/settings/ai` | Update AI provider settings |
| `POST` | `/settings/ai/test` | Test the provider using the values supplied |
| `GET` | `/settings/confluence` | Confluence settings, without the token |
| `PUT` | `/settings/confluence` | Update Confluence settings |
| `POST` | `/settings/confluence/test` | Test Confluence using the values supplied |
| `GET` | `/settings/closure-checks` | Fields required before an assessment can close |
| `PUT` | `/settings/closure-checks` | Update the closure check rules |
| `GET` | `/workflows/{entityType}` | Workflow definition and transitions |
| `GET` | `/workflows/{entityType}/transitions` | Transitions available from a status |
| `GET` | `/audit` | Paginated audit log |
| `GET` | `/audit/export` | Export up to 10,000 audit events as CSV |

## Notifications

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/notifications` | Paginated notifications, optionally unread only |
| `PATCH` | `/notifications/{id}/read` | Mark one notification read |
| `POST` | `/notifications/read-all` | Mark all notifications read |
| `GET` | `/notifications/preferences` | Read channel preferences |
| `PUT` | `/notifications/preferences` | Update channel preferences |

## API Change Guidelines

- Add new endpoints under `/api/v1`; create a new version for incompatible contracts.
- Validate every body and externally supplied query parameter with Zod.
- Use common response helpers and `ApiError` subclasses.
- Apply a permission and row scope before returning entity data.
- Audit security-sensitive mutations.
- Add pagination for any collection that can grow without a hard domain bound.
