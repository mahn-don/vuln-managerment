# Domain Model and Business Rules

The security vocabulary this platform encodes, and the rules attached to each term. Terms here are
the bank's, not generic ones — where a word means something specific, that meaning is load-bearing
in the code and the UI.

`ARCHITECTURE.md` covers how the code is arranged; this covers what it is arranged around.

## Applications

The asset inventory. Every assessment and every vulnerability hangs off one or more applications.

**Names are standardized here and nowhere else.** People raising tickets write "IB portal",
"internet banking", or nothing recognizable at all. Reconciling those against this list is the job
of ticket triage, below.

**Aliases** (`ApplicationAlias`) record the other names a system is known by, with a `source` saying
where each came from (manual, a Jira component, a confirmed mapping). They feed name matching.

### Level

`Application.level` is an integer, **1, 2 or 3**. It is the bank's own tiering of how important an
application is, and it drives the periodic assessment cadence.

Level is **never colour-coded**. It is a category, not a risk score, and colour in this product means
risk or time only. Show it as a plain label.

### Internet exposure

Whether the application is reachable from the public internet. Surfaced on the dashboard and
application list because it changes how urgently a finding is treated.

## Assessments

A security assessment of an application — in practice, a penetration test. `Assessment` carries
status, assignee, dates, findings, and links to one or more applications through
`AssessmentApplication` (a join table with a composite key and **no `id` column**).

### Scope: go-live vs periodic

`AssessmentScope` has exactly two values, and the distinction runs through the whole product:

| Scope | What it covers |
|---|---|
| `GOLIVE` | Only what is new in an update — a feature, a release, a hotfix |
| `PERIODIC` | A comprehensive assessment of the entire application |

One application routinely has both kinds open at once, so they must stay visually distinguishable
everywhere they appear. **Vulnerabilities inherit the scope of the assessment that found them**, so
a finding is a "go-live finding" or a "periodic finding".

Only a `PERIODIC` assessment advances the periodic clock. Closing a go-live test does not make an
application current — see `refreshPeriodicCycle()` in
`src/modules/assessment-management/services/periodic-policy.service.ts`.

### Size (go-live only)

Set during triage, for `GOLIVE` work only:

| Size | Meaning |
|---|---|
| `SMALL` | A hotfix or a minor change |
| `MEDIUM` | One or two features |
| `LARGE` | More than two features |

The stated rule is "medium is a single feature, large is more than two", which leaves two features
unspecified. The code resolves it as medium — see `estimateSize()` in `ticket-triage.service.ts`.

Size is a **workload** judgement, not a risk one, so it is rendered neutrally — no risk colour.

### Periodic cadence

Applications need a periodic assessment on a cadence set by their level
(`PERIODIC_MONTHS_BY_LEVEL`):

| Level | Cadence |
|---:|---|
| 1 | Every 12 months (annual) |
| 2 | Every 24 months (biennial) |
| 3 | Every 24 months (biennial) |

Two **different** questions are answered about the same date, and they are deliberately not merged:

**`periodicState` — is this application compliant with its own cadence?**
`NEVER_ASSESSED` | `OVERDUE` | `DUE_SOON` | `CURRENT`. `NEVER_ASSESSED` is kept distinct from
`OVERDUE` because an application that has never been looked at is a different problem from one
whose review has lapsed.

**`evaluationRecency` — which calendar year was it last evaluated in?**
`THIS_YEAR` | `LAST_YEAR` | `TWO_YEARS_AGO` | `OLDER` | `NEVER`, colour-coded green / blue / orange /
— / red. This is a **calendar-year** bucket, not an elapsed-time one: an application assessed last
December is "last year" even if that was only weeks ago.

A biennial application assessed last year is `CURRENT` **and** `LAST_YEAR`. Both statements are true;
they answer different questions. Do not derive one from the other.

### Closure checks

Closing a pentest assessment requires the record to actually carry the information the security team
needs. Administrators configure which fields are required at **Administration → Closure checks**;
`closure-policy.service.ts` evaluates them.

The catalogue is a **fixed list**, not free-text field names, so a requirement can never point at a
field that does not exist or silently pass because of a typo:

`description`, `scope`, `assignee`, `dueDate`, `startedDate`, `applications`, `findingCount`,
`findingsLinked`, `findingsTriaged`, `complexity`, `priority`, `externalIssue`

Each rule carries an enforcement: `BLOCK` stops the close, `WARN` is shown but lets it through.

## Vulnerabilities

Findings, with severity, status, and an SLA clock. They link to applications through
`VulnerabilityApplication` and inherit `GOLIVE`/`PERIODIC` from the assessment that produced them.

**SLA** rules (`SLARule`) resolve by severity and optionally by application level (`appLevel`, null
matching any). `SLAStatus` drives the "Breached SLA" queue in the sidebar.

**Risk acceptance** is a two-person control: one person requests, a second approves. A requested
acceptance is not in force until approved — see `RiskAcceptanceStatus`.

## Jira integration and ticket triage

Assessment and vulnerability tickets arrive from Jira, by scheduled sync (the worker process) or
webhook. They land as `ExternalIssue` rows, keyed on `sourceId` (`"SEC-301"`), unique on
`[source, sourceId]`.

### The triage step

`src/modules/intelligence-engine/services/ticket-triage.service.ts` runs on each synced ticket and
answers three questions.

**1. Which inventory application is this ticket about?**

`app-resolution.service.ts` builds a scored candidate shortlist using several strategies, in
descending trust:

| Score | Strategy |
|---:|---|
| 100 | An application ID (`APP-0123`) appears in the text |
| 95 | Exact normalized name match on a title term |
| 90 | Alias match, Jira component mapping, **or an inventory name written out in the ticket text** |
| ≤85 | Fuzzy name similarity, reporter history, reporter's team |
| ≤55 | Recall pass — fuzzy, and by construction never enough to decide alone |

The content-mention strategy (`matchByMention`) is what makes "map by content, not just by name"
work: requesters title tickets "Go-live pentest request" and name the system in the body or in the
page it links to. It has two guards — a name must be at least 8 characters and 2 words, so "CRM"
never binds on prose; and **if the text names more than one application it returns nothing**, since a
release note that mentions a dependency alongside its own system is ambiguous. Both applications
still appear as candidates for a human.

`AUTO_LINK_THRESHOLD` is 90 **and** the match method must be deterministic. Fuzzy and recall matches
never auto-link no matter how they score — they go to the Mapping Review queue.

**2. How big is the change?** (go-live tickets only)

Sized `SMALL`/`MEDIUM`/`LARGE` per the table above, with a stated rationale naming what was counted.

**3. What is actually changing, and what needs security attention?**

The AI reads the ticket and returns a scope summary, the security focus points, and what the
requester failed to provide.

### Confluence

A go-live ticket is usually two lines and a link; the linked specification is where the change is
actually described. When configured at **Administration → Confluence**, triage opens the Confluence
links in a ticket and feeds the page text into all three answers above — matching, sizing, and the
change summary.

Every link is reported back to the reviewer, read or not: a link that could not be opened is shown
as such, so a thin summary is not mistaken for a thin specification.

Reading limits (pages per ticket, characters per page) are configurable and bound both what is
fetched and what is sent for analysis.

### Degraded behaviour without AI

External AI is off by default. Triage still runs, on keyword heuristics: relevance, scope, size,
security focus areas and deterministic application matching all still work, and a heuristic result
is labelled as such in the UI. The one thing the heuristic cannot produce is the prose "what is
changing" summary, so that section is omitted rather than filled with an excerpt.

### Mapping review

Anything that did not auto-link lands in the Mapping Review queue with its triage panel, the
suggested application, the alternatives and their scores, and Confirm / No Match / Re-analyze.
A confirmed mapping can teach an alias back to the inventory, subject to plausibility guards — an
alias is a name, so it must be short and look like a system rather than a request.

## Access control

**RBAC**: nine roles in `enum UserRole`, mapped to permissions in `src/lib/auth/permissions.ts`.

**ABAC**: results are additionally scoped to the caller's business unit, application ownership, or
remediation assignment. A security manager sees their own unit's data; a developer sees what they
own or are remediating.

Both are enforced at the page, API, and data layers — see the authorization note in `CLAUDE.md`.
