# Application User Guide

## Signing In

Open the application URL and sign in with an active account. Sessions last up to eight hours. Ten login attempts for the same email/IP combination within 15 minutes trigger a temporary rate limit.

The local development seed creates:

| Role | Email | Password |
|---|---|---|
| System administrator | `admin@secplatform.local` | `admin123` |
| Security manager | `manager@secplatform.local` | `manager123` |
| Security engineer | `engineer@secplatform.local` | `engineer123` |

These passwords are strictly for local development. A production seed must use secret environment variables or accounts provisioned through an administrative process.

## Role Behavior

| Role | Typical access |
|---|---|
| System Administrator | All features, users, configuration, imports, integrations, and audit data |
| Security Administrator | Platform configuration, imports, integrations, inventory, reporting, audit, and mapping review |
| Security Manager | Applications, assessments, vulnerabilities, assignment, risk acceptance, SLA, and reporting within the assigned business unit |
| Security Engineer | Global application and security-work visibility, lifecycle updates, mapping review, and personal queue |
| Application Owner | Owned applications and their assessments/vulnerabilities, plus scoped reporting |
| Developer | Applications associated with assigned remediation work and vulnerabilities assigned as fix owner |
| Auditor | Read-only global inventory, assessment, vulnerability, dashboard, and audit access |
| Executive | Read-only global inventory and reporting access |
| Read Only | Read-only inventory and dashboard access |

Permissions are enforced by the API. Business-unit, ownership, and remediation scopes still apply even if a user knows a direct record URL.

## Navigation

- **My Queue**: assessments and vulnerabilities assigned to the current security user.
- **Mapping Review**: unresolved Jira-to-application mappings requiring a decision.
- **Breached SLA**: open vulnerabilities with breached SLA.
- **Applications**: asset inventory and application security posture.
- **Assessments**: security review intake and execution lifecycle.
- **Vulnerabilities**: findings, SLA state, assignees, and remediation status.
- **Posture**: executive KPIs and vulnerability distribution.
- **Operations**: backlog, assignment, SLA, and team workload.
- **Analytics**: trends such as MTTR, throughput, aging, and SLA compliance.
- **Ask the Data**: deterministic security metrics with an optional AI explanation fallback.
- **Administration**: users, imports, Jira, SLA rules, and audit logs for administrative roles.

The first page after login depends on role. Developers land on their scoped vulnerability list, engineers on My Queue, managers on Operations, and reporting roles on Posture.

## Applications

### Browse and Search

Use Applications to search by application name, stable application ID, or alias. Filters include status, criticality, business unit, internet exposure, assessment state, and open findings. Sorting and pagination are server-side.

### Create or Edit

Authorized users can create an application with:

- Stable application ID and name
- Business unit and department
- Criticality and internet-facing status
- Data classification and compliance scope
- Technology stack and repository/service/production URLs
- Lifecycle status and go-live date

Application IDs cannot be changed after creation. Archiving is a soft delete. Security managers may only create or move applications within their assigned business unit.

### Application Detail

The application view combines:

- Metadata, owners, aliases, and update provenance
- Open vulnerability counts and severity breakdown
- Assessment history and upcoming assessment dates
- Related vulnerabilities and status timeline

Use CSV export for a scoped application inventory extract. Cells beginning with spreadsheet formulas are neutralized automatically.

## Assessments

### Create an Assessment

Choose one or more applications, assessment type, title, priority, requester, assignee, and due date. The first application is treated as primary. A display key such as `ASM-00001` is generated automatically.

### Assignment

Managers can assign an assessment manually or request a recommendation. Recommendations consider current weighted workload, prior work on the application, and experience with the assessment type. The recommendation is advisory; a human remains responsible for the decision.

### Status Workflow

Use only transitions permitted by the configured workflow. Typical states include requested, triage, queued, assigned, in progress, waiting for information, review complete, findings documented, done, and cancelled. Status changes record actor, timestamp, source, and optional reason.

## Vulnerabilities

### Create and Triage

Record title, affected applications, severity, description, CWE/CVE/CVSS data, source assessment, assignee, fix owner, environment, evidence, recommendation, and remediation effort. The platform calculates a due date from the most specific active SLA rule and generates a key such as `VUL-00001`.

### Lifecycle

Use the status action instead of editing status as generic metadata. Transition validation prevents invalid workflow jumps. Closing or otherwise terminating a vulnerability updates application-level open counters.

### SLA

SLA states are on track, at risk, breached, paused, exempt, met, or missed. The hourly worker recalculates active findings. Configuration changes affect new calculations; review policy before changing an active rule.

### Risk Acceptance

Users with risk-acceptance permission must enter a substantive justification and may set expiration and conditions. The authenticated approver is recorded automatically; the caller cannot nominate another approver. Risk acceptance exempts the finding from SLA tracking and is audit logged.

## Excel Inventory Import

1. Open Administration > Imports and choose Upload.
2. Select an `.xlsx` file no larger than 10 MB.
3. Map worksheet columns to application fields.
4. Review the preview summary: new, updated, unchanged, invalid, duplicate, and removed.
5. Correct invalid rows or adjust the mapping before confirmation.
6. Confirm the import to apply included rows.
7. Review the completed import report.

Processing limits are 10,000 rows, 100 columns, 10,000 archive entries, and 100 MB expanded content. The API returns the first 500 preview rows while retaining the bounded import set for confirmation.

An import can be rolled back for 24 hours. New records are archived and updated fields are restored. Non-admin users can access only their own import jobs, and business-unit scope is enforced throughout the import.

## Jira Integration

Administrators configure Jira through environment variables, then use Administration > Jira Integration to:

- Confirm whether the integration is configured
- Test credentials and connectivity
- Start a manual full sync
- Review sync history and failures

The worker performs incremental synchronization every 15 minutes. Unchanged issues are not rewritten. Configure Jira webhooks to send `X-Webhook-Secret` matching `JIRA_WEBHOOK_SECRET` to `/api/v1/webhooks/jira`.

Uncertain application matches enter Mapping Review. Review the issue evidence and candidates, then confirm, override, or reject the mapping. Jira write-back actions remain queued until an authorized user approves them.

## Dashboards and Analytics

- **Posture** summarizes application coverage, open vulnerability severity, SLA compliance, and trend data.
- **Operations** focuses on assessment backlog, unassigned work, verification backlog, SLA risk, and engineer workload.
- **Analytics** provides MTTR, assessment throughput, created-versus-closed findings, SLA trends, and aging.
- **Daily Brief** summarizes the current scoped metrics and highlights urgent work.

Dashboard caches vary by effective authorization scope. Filters use inclusive UTC date boundaries.

## Ask the Data and AI

Ask concise questions such as:

- How many critical vulnerabilities are open?
- Which applications have never been assessed?
- How many assessments are overdue?
- What is the current SLA compliance rate?

The service first matches deterministic predefined metrics. It does not execute AI-generated SQL. When external AI is explicitly enabled, an AI fallback can explain questions it cannot answer from predefined metrics, but it has no direct database access.

Ticket analysis and daily insights also fall back to deterministic logic when AI is disabled. External processing should be enabled only after the organization has approved the provider and data-handling terms.

## Notifications

The notification center supports unread filtering, individual read state, mark-all-read, and per-event channel preferences. In-app notifications work from the database. Email preferences do not currently result in real email delivery because the email adapter is a logging stub.

## Administration

### Users

System administrators can view users and update roles. A security manager must also have a business-unit assignment; role assignment alone intentionally yields an empty scope.

### SLA Rules

Review rule priority carefully. More specific, higher-priority rules override defaults based on severity, application criticality, internet exposure, business unit, environment, or compliance scope.

### Audit

Audit logs can be filtered and exported. Exports are capped and formula-safe. Treat audit data as sensitive because it may contain user identifiers, IP addresses, entity IDs, and change details.

## Operational Usage Guidelines

- Use stable application IDs; use aliases for alternate names instead of creating duplicates.
- Link findings to every affected application, with the primary application first.
- Record status changes through workflow actions to preserve history.
- Put evidence and justification in the appropriate fields, not in titles.
- Do not upload secrets, credentials, tokens, or unnecessary personal data.
- Review AI output as a recommendation, never as an authoritative decision.
- Use risk acceptance only for approved business decisions with an owner and expiration policy.
- Investigate unresolved mappings and SLA breaches routinely so dashboards remain actionable.
