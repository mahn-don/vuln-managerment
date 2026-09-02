import { prisma } from "@/lib/db/prisma";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { normalizeAppName } from "@/lib/utils/normalize";
import { createChildLogger } from "@/lib/logger";
import { auditService } from "@/modules/platform-services/services/audit.service";
import {
  getApplicationScopeFilter,
  scopeApplicationWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";
import type { MappingStatus, Prisma } from "@/generated/prisma";

const logger = createChildLogger("app-resolution");

export interface ResolutionCandidate {
  applicationId: string;
  applicationName: string;
  applicationKey: string;
  score: number;
  evidence: string[];
  matchMethod: string;
}

export interface ResolutionResult {
  candidates: ResolutionCandidate[];
  bestMatch: ResolutionCandidate | null;
  confidence: number;
  autoLinked: boolean;
  requiresReview: boolean;
  explanation: string;
}

export interface TicketContext {
  title: string;
  description?: string;
  labels: string[];
  components: string[];
  reporterEmail?: string;
  assigneeEmail?: string;
  sourceId: string;
}

// Confidence thresholds
const AUTO_LINK_THRESHOLD = 90;
const REVIEW_THRESHOLD = 70;

// Recall pass: how far down the inventory to look when nothing matched well.
const RECALL_MIN_SIMILARITY = 0.3;
const RECALL_LIMIT = 8;
const RECALL_MAX_SCORE = 55; // Always below REVIEW_THRESHOLD: recall alone never decides.
/** A name found written out in the ticket text is evidence, not a guess. */
const MENTION_NAME_SCORE = 90;
const MENTION_ALIAS_SCORE = 85;
const MENTION_MIN_LENGTH = 8;
const MENTION_MIN_WORDS = 2;
const INVENTORY_INDEX_LIMIT = 5000;
/** Fragments taken from ticket prose per pass; bounds the comparison cost. */
const CONTENT_TERM_LIMIT = 40;
/** How much of a name must appear in the text to count as naming it. */
const DOCUMENT_MENTION_MIN = 0.75;
const INVENTORY_TTL_MS = 5 * 60 * 1000;

interface InventoryEntry {
  id: string;
  name: string;
  applicationId: string;
  normalizedName: string;
  searchable: string[];
}

let inventoryIndex: { entries: InventoryEntry[]; builtAt: number } | null =
  null;

/**
 * Limits on what a confirmed mapping may teach. An alias is a name, so it is
 * short, has few words, and describes a system rather than a request.
 */
const ALIAS_MAX_CHARS = 60;
const ALIAS_MAX_WORDS = 5;
const ALIAS_MIN_OVERLAP = 0.5;

/** Vocabulary that marks a phrase as describing work, not naming a system. */
const REQUEST_WORDS = new Set([
  "needs",
  "need",
  "please",
  "request",
  "requested",
  "review",
  "check",
  "issue",
  "issues",
  "problem",
  "bug",
  "fix",
  "update",
  "change",
  "assessment",
  "security",
  "pentest",
  "audit",
  "urgent",
  "asap",
  "help",
  "support",
  "ticket",
  "task",
  "page",
  "login",
  "error",
  "failure",
  "danh",
  "gia",
  "bao",
  "mat",
  "kiem",
  "tra",
]);

/**
 * Words carried by so many application names that they cannot tell two apart.
 * Stripped for recall comparison only — stored normalized names are untouched.
 */
const GENERIC_NAME_WORDS = new Set([
  "system",
  "service",
  "services",
  "application",
  "app",
  "apps",
  "platform",
  "api",
  "solution",
  "module",
  "tool",
  "the",
  "for",
  "and",
  "of",
  "new",
]);

function distinctiveWords(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[^a-z0-9]+/i)
        .map((word) => word.toLowerCase())
        .filter(
          (word) =>
            word.length >= 2 &&
            !GENERIC_NAME_WORDS.has(word) &&
            !/^v?\d+$/.test(word),
        ),
    ),
  ];
}

/** Mapping states a person owns — AI triage may annotate them but never reopen them. */
const HUMAN_DECIDED: MappingStatus[] = [
  "HUMAN_CONFIRMED",
  "HUMAN_OVERRIDDEN",
  "REJECTED",
];

class AppResolutionService {
  /**
   * Resolve which application a ticket belongs to.
   * Multi-stage pipeline: deterministic → fuzzy → scoring → decision.
   */
  async resolve(
    externalIssueId: string,
    context: TicketContext,
  ): Promise<ResolutionResult> {
    logger.info(
      { sourceId: context.sourceId },
      "Starting application resolution",
    );

    // Stage 1: Generate candidates from multiple sources
    const candidates = await this.buildCandidates(context);

    if (candidates.length === 0) {
      return {
        candidates: [],
        bestMatch: null,
        confidence: 0,
        autoLinked: false,
        requiresReview: true,
        explanation: "No matching applications found",
      };
    }

    const best = candidates[0];
    const confidence = best.score;

    // Stage 3: Decision
    let autoLinked = false;
    let requiresReview = true;
    let explanation: string;

    if (confidence >= AUTO_LINK_THRESHOLD && this.isDeterministicMatch(best)) {
      autoLinked = true;
      requiresReview = false;
      explanation = `Auto-linked with ${confidence}% confidence via ${best.matchMethod}`;

      // Create auto mapping
      await this.createMapping(
        externalIssueId,
        best.applicationId,
        "AUTO_MATCHED",
        confidence,
        best,
      );
    } else if (confidence >= REVIEW_THRESHOLD) {
      requiresReview = true;
      explanation = `Recommended match (${confidence}% confidence) — requires human confirmation`;

      // Create pending mapping
      await this.createMapping(
        externalIssueId,
        best.applicationId,
        "UNRESOLVED",
        confidence,
        best,
        candidates,
      );
    } else {
      requiresReview = true;
      explanation = `Low confidence (${confidence}%) — manual review required`;

      // Create unresolved mapping
      await this.createMapping(
        externalIssueId,
        null,
        "UNRESOLVED",
        confidence,
        best,
        candidates,
      );
    }

    logger.info(
      {
        sourceId: context.sourceId,
        confidence,
        autoLinked,
        bestMatch: best.applicationName,
      },
      "Resolution complete",
    );

    return {
      candidates: candidates.slice(0, 5), // Top 5
      bestMatch: best,
      confidence,
      autoLinked,
      requiresReview,
      explanation,
    };
  }

  /**
   * The shortlist of inventory applications a ticket could be about, best first.
   *
   * Deterministic and fuzzy strategies first; if they turn up little, a recall
   * pass ranks the whole active inventory by name similarity so there is always
   * something concrete to choose between. AI triage picks from this list — it is
   * never allowed to name an application that is not in it.
   */
  async buildCandidates(
    context: TicketContext,
  ): Promise<ResolutionCandidate[]> {
    const candidates = await this.generateCandidates(context);

    // Recall pass: widen the field when nothing scored well. Requesters rarely
    // write the standardized name, so "no candidates" usually means the string
    // never matched, not that the application is absent from the inventory.
    const strong = candidates.filter((c) => c.score >= REVIEW_THRESHOLD);
    if (strong.length === 0) {
      const known = new Set(candidates.map((c) => c.applicationId));
      const recalled = await this.matchByRecall(context);
      for (const candidate of recalled) {
        if (!known.has(candidate.applicationId)) candidates.push(candidate);
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * Rank the active inventory by name similarity to the whole ticket.
   *
   * Deliberately weak scoring — these are suggestions for a human or for AI
   * disambiguation, never enough on their own to auto-link.
   */
  private async matchByRecall(
    context: TicketContext,
  ): Promise<ResolutionCandidate[]> {
    const index = await this.getInventoryIndex();
    if (index.length === 0) return [];

    // The description is where the application is often actually named — a
    // title like "Go-live pentest" carries nothing, while the body says which
    // system it is. Matching on the title alone was the main reason tickets
    // arrived unattributed.
    const terms = [
      ...this.extractAppNames(context.title),
      ...this.contentTerms(context.description),
      ...context.components,
      ...context.labels,
    ]
      .map((term) => normalizeAppName(term))
      .filter((term) => term.length >= 3);

    if (terms.length === 0) return [];

    const scored: {
      entry: InventoryEntry;
      similarity: number;
      matched: string;
    }[] = [];

    // Names inside prose do not survive fragment splitting — "…transfer to the
    // Internet Banking Portal." is one long fragment that matches nothing. So
    // the whole text is also treated as a bag of words and each inventory name
    // tested for whether its distinctive words all appear somewhere in it.
    const documentWords = new Set(
      distinctiveWords([context.title, context.description ?? ""].join(" ")),
    );

    for (const entry of index) {
      let best = 0;
      let matchedOn = entry.name;
      for (const term of terms) {
        for (const searchable of entry.searchable) {
          const similarity = this.recallSimilarity(term, searchable);
          if (similarity > best) {
            best = similarity;
            matchedOn = searchable;
          }
        }
      }

      const mentioned = this.documentMention(entry, documentWords);
      if (mentioned > best) {
        best = mentioned;
        matchedOn = entry.name;
      }
      if (best >= RECALL_MIN_SIMILARITY)
        scored.push({ entry, similarity: best, matched: matchedOn });
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    return scored
      .slice(0, RECALL_LIMIT)
      .map(({ entry, similarity, matched }) => ({
        applicationId: entry.id,
        applicationName: entry.name,
        applicationKey: entry.applicationId,
        score: Math.round(similarity * RECALL_MAX_SCORE),
        evidence: [
          `Inventory recall: ticket text is ${Math.round(similarity * 100)}% similar to "${matched}"`,
        ],
        matchMethod: "recall",
      }));
  }

  /**
   * Is this application named anywhere in the ticket's text?
   *
   * Requires nearly all of the name's distinctive words to be present, so
   * "Internet Banking Portal" matches a sentence containing all three but
   * "Banking" alone never drags in every banking system in the inventory.
   */
  private documentMention(
    entry: InventoryEntry,
    documentWords: Set<string>,
  ): number {
    const nameWords = distinctiveWords(entry.name);
    if (nameWords.length === 0) return 0;

    const present = nameWords.filter((word) => documentWords.has(word)).length;
    const coverage = present / nameWords.length;
    return coverage >= DOCUMENT_MENTION_MIN ? coverage : 0;
  }

  /**
   * How well a ticket phrase matches an inventory name, for recall only.
   *
   * Character bigrams alone punish length: "pentest for mobile banking app
   * before launch" scored 0.29 against "Mobile Banking Application" even though
   * every word of the name is present. Word coverage catches that case, and the
   * two are combined by taking whichever is more generous.
   */
  private recallSimilarity(term: string, searchable: string): number {
    const dice = this.calculateSimilarity(term, searchable);
    const coverage = this.wordCoverage(term, searchable);
    return Math.max(dice, coverage);
  }

  /**
   * The share of the inventory name's distinguishing words that appear in the
   * ticket text. Words like "application" or "system" are dropped from both
   * sides first — nearly every entry carries one, so they separate nothing.
   */
  private wordCoverage(term: string, searchable: string): number {
    const nameWords = distinctiveWords(searchable);
    if (nameWords.length === 0) return 0;

    const ticketWords = new Set(distinctiveWords(term));
    if (ticketWords.size === 0) return 0;

    const matched = nameWords.filter((word) => ticketWords.has(word)).length;
    return matched / nameWords.length;
  }

  /**
   * Candidate phrases from free text.
   *
   * Application names in prose sit inside sentences, so the text is split on
   * punctuation and line breaks and each fragment offered as a candidate. Long
   * fragments are dropped — a whole sentence never matches a name and only
   * costs comparisons.
   */
  private contentTerms(text: string | undefined): string[] {
    if (!text) return [];

    return [
      ...new Set(
        text
          .split(/[\n\r.,;:!?()[\]{}|\/\\]+/)
          .map((fragment) => fragment.trim())
          .filter((fragment) => fragment.length >= 3 && fragment.length <= 60),
      ),
    ].slice(0, CONTENT_TERM_LIMIT);
  }

  /**
   * Compact, briefly cached view of the active inventory used by the recall pass.
   * Rebuilt on a timer rather than per ticket — a sync triages tickets in bulk.
   */
  private async getInventoryIndex(): Promise<InventoryEntry[]> {
    const now = Date.now();
    if (inventoryIndex && now - inventoryIndex.builtAt < INVENTORY_TTL_MS) {
      return inventoryIndex.entries;
    }

    const apps = await prisma.application.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        applicationId: true,
        normalizedName: true,
        aliases: { select: { normalizedAlias: true } },
      },
      take: INVENTORY_INDEX_LIMIT,
    });

    const entries: InventoryEntry[] = apps.map((app) => ({
      id: app.id,
      name: app.name,
      applicationId: app.applicationId,
      normalizedName: app.normalizedName,
      searchable: [
        ...new Set(
          [
            app.normalizedName,
            normalizeAppName(app.applicationId),
            ...app.aliases.map((a) => a.normalizedAlias),
          ].filter((value) => value.length >= 3),
        ),
      ],
    }));

    inventoryIndex = { entries, builtAt: now };
    return entries;
  }

  /** Drop the cached inventory index — call after the inventory is imported. */
  invalidateInventoryIndex() {
    inventoryIndex = null;
  }

  /**
   * Generate candidates from multiple matching strategies.
   */
  private async generateCandidates(
    context: TicketContext,
  ): Promise<ResolutionCandidate[]> {
    const candidateMap = new Map<string, ResolutionCandidate>();

    // Extract potential app names from title
    const titleTerms = this.extractAppNames(context.title);
    const descTerms = context.description
      ? this.extractAppNames(context.description)
      : [];

    // Strategy 1: Exact Application ID match (in title or description)
    const appIdMatches = await this.matchByAppId([...titleTerms, ...descTerms]);
    for (const match of appIdMatches) {
      this.addCandidate(candidateMap, match);
    }

    // Strategy 2: Exact name/alias match
    const nameMatches = await this.matchByExactName(titleTerms);
    for (const match of nameMatches) {
      this.addCandidate(candidateMap, match);
    }

    // Strategy 2b: the standardized name written out inside the ticket body or
    // the specification it links to. Requesters title tickets "Go-live pentest"
    // and name the system in the text.
    const mentionMatches = await this.matchByMention(context);
    for (const match of mentionMatches) {
      this.addCandidate(candidateMap, match);
    }

    // Strategy 3: Component mapping
    if (context.components.length > 0) {
      const componentMatches = await this.matchByComponent(context.components);
      for (const match of componentMatches) {
        this.addCandidate(candidateMap, match);
      }
    }

    // Strategy 4: Fuzzy name matching
    const fuzzyMatches = await this.matchByFuzzyName([
      ...titleTerms,
      ...descTerms,
    ]);
    for (const match of fuzzyMatches) {
      this.addCandidate(candidateMap, match);
    }

    // Strategy 5: Historical mapping (same reporter + similar title pattern)
    if (context.reporterEmail) {
      const historicalMatches = await this.matchByHistory(
        context.reporterEmail,
        context.title,
      );
      for (const match of historicalMatches) {
        this.addCandidate(candidateMap, match);
      }
    }

    // Strategy 6: Reporter's team → team's applications
    if (context.reporterEmail) {
      const teamMatches = await this.matchByReporterTeam(context.reporterEmail);
      for (const match of teamMatches) {
        this.addCandidate(candidateMap, match);
      }
    }

    return Array.from(candidateMap.values());
  }

  /**
   * Extract potential application name segments from text.
   */
  private extractAppNames(text: string): string[] {
    // Remove common prefixes
    const cleaned = text
      .replace(
        /^(security review|pentest|assessment|code review|review)\s*[-:–]\s*/i,
        "",
      )
      .replace(/\s*(v\d+(\.\d+)*)\s*/g, " ")
      .trim();

    const terms: string[] = [cleaned];

    // Also try substrings split by common delimiters
    const parts = cleaned
      .split(/[-–:,/|]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);
    terms.push(...parts);

    return [...new Set(terms)];
  }

  /**
   * Strategy 1: Match by Application ID found in text.
   */
  private async matchByAppId(terms: string[]): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    // Look for patterns like APP-0123, APP0123
    const appIdPattern = /\b(APP[-_]?\d{3,6})\b/i;

    for (const term of terms) {
      const match = term.match(appIdPattern);
      if (match) {
        const app = await prisma.application.findFirst({
          where: { applicationId: { equals: match[1], mode: "insensitive" } },
          select: { id: true, name: true, applicationId: true },
        });
        if (app) {
          results.push({
            applicationId: app.id,
            applicationName: app.name,
            applicationKey: app.applicationId,
            score: 100,
            evidence: [`Exact Application ID match: ${match[1]}`],
            matchMethod: "exact_id",
          });
        }
      }
    }

    return results;
  }

  /**
   * Strategy 2: Exact name or alias match.
   */
  private async matchByExactName(
    terms: string[],
  ): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    for (const term of terms) {
      const normalized = normalizeAppName(term);
      if (normalized.length < 3) continue;

      // Check application names
      const nameMatch = await prisma.application.findFirst({
        where: { normalizedName: normalized },
        select: { id: true, name: true, applicationId: true },
      });
      if (nameMatch) {
        results.push({
          applicationId: nameMatch.id,
          applicationName: nameMatch.name,
          applicationKey: nameMatch.applicationId,
          score: 95,
          evidence: [`Exact name match: "${term}"`],
          matchMethod: "exact_name",
        });
      }

      // Check aliases
      const aliasMatch = await prisma.applicationAlias.findFirst({
        where: { normalizedAlias: normalized },
        include: {
          application: {
            select: { id: true, name: true, applicationId: true },
          },
        },
      });
      if (aliasMatch) {
        results.push({
          applicationId: aliasMatch.application.id,
          applicationName: aliasMatch.application.name,
          applicationKey: aliasMatch.application.applicationId,
          score: 90,
          evidence: [
            `Alias match: "${term}" matches alias "${aliasMatch.alias}"`,
          ],
          matchMethod: "alias",
        });
      }
    }

    return results;
  }

  /**
   * Strategy 2b: an inventory name written out in the ticket's text.
   *
   * Distinct from the recall pass, which is fuzzy and never decides on its own:
   * this looks for the standardized name as a whole phrase, so finding it is
   * the same evidence as reading it in the title — just further down the page.
   *
   * Two guards keep it from over-firing. A name must be long enough to be a
   * name rather than a word ("Payment Gateway Service" qualifies, "CRM" does
   * not), and if the text names more than one application nothing is returned:
   * a release note that mentions a dependency alongside its own system is
   * ambiguous, and the recall pass will still surface both for a human.
   */
  private async matchByMention(
    context: TicketContext,
  ): Promise<ResolutionCandidate[]> {
    const index = await this.getInventoryIndex();
    if (index.length === 0) return [];

    const haystack = ` ${normalizeAppName(
      [context.title, context.description ?? ""].join(" "),
    )} `;
    if (haystack.length < MENTION_MIN_LENGTH) return [];

    const found: ResolutionCandidate[] = [];

    for (const entry of index) {
      const name = entry.normalizedName;
      if (this.isMentionable(name) && haystack.includes(` ${name} `)) {
        found.push({
          applicationId: entry.id,
          applicationName: entry.name,
          applicationKey: entry.applicationId,
          score: MENTION_NAME_SCORE,
          evidence: [
            `Inventory name "${entry.name}" appears in the ticket text`,
          ],
          matchMethod: "content_name",
        });
        continue;
      }

      // Text calls it "Mobile Banking" where the inventory says "Mobile Banking
      // Application". The suffix is a category word, not part of the identity,
      // so the shortened phrase is the same evidence as the full name.
      const distinctive = this.distinctivePhrase(name);
      if (
        distinctive &&
        this.isMentionable(distinctive) &&
        haystack.includes(` ${distinctive} `)
      ) {
        found.push({
          applicationId: entry.id,
          applicationName: entry.name,
          applicationKey: entry.applicationId,
          score: MENTION_NAME_SCORE,
          evidence: [`"${distinctive}" in the ticket text names ${entry.name}`],
          matchMethod: "content_name",
        });
        continue;
      }

      const alias = entry.searchable.find(
        (value) =>
          value !== name &&
          this.isMentionable(value) &&
          haystack.includes(` ${value} `),
      );
      if (alias) {
        found.push({
          applicationId: entry.id,
          applicationName: entry.name,
          applicationKey: entry.applicationId,
          score: MENTION_ALIAS_SCORE,
          evidence: [`Alias "${alias}" appears in the ticket text`],
          matchMethod: "content_alias",
        });
      }
    }

    return found.length === 1 ? found : [];
  }

  /**
   * A name with its leading and trailing category words removed.
   *
   * Only the edges: dropping a word from the middle would leave a phrase that
   * never appears in anyone's writing.
   */
  private distinctivePhrase(normalizedName: string): string | null {
    const words = normalizedName.split(" ");
    while (words.length > 0 && GENERIC_NAME_WORDS.has(words[0])) words.shift();
    while (words.length > 0 && GENERIC_NAME_WORDS.has(words[words.length - 1]))
      words.pop();

    const phrase = words.join(" ");
    return phrase && phrase !== normalizedName ? phrase : null;
  }

  /** Long enough, and specific enough, to be a name rather than a word. */
  private isMentionable(value: string): boolean {
    return (
      value.length >= MENTION_MIN_LENGTH &&
      value.split(" ").length >= MENTION_MIN_WORDS
    );
  }

  /**
   * Strategy 3: Match by Jira component → application mapping.
   */
  private async matchByComponent(
    components: string[],
  ): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    for (const component of components) {
      const alias = await prisma.applicationAlias.findFirst({
        where: {
          normalizedAlias: normalizeAppName(component),
          source: "JIRA_COMPONENT",
        },
        include: {
          application: {
            select: { id: true, name: true, applicationId: true },
          },
        },
      });
      if (alias) {
        results.push({
          applicationId: alias.application.id,
          applicationName: alias.application.name,
          applicationKey: alias.application.applicationId,
          score: 90,
          evidence: [`Jira component "${component}" mapped to application`],
          matchMethod: "component",
        });
      }
    }

    return results;
  }

  /**
   * Strategy 4: Fuzzy name matching using normalized string similarity.
   */
  private async matchByFuzzyName(
    terms: string[],
  ): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    for (const term of terms) {
      const normalized = normalizeAppName(term);
      if (normalized.length < 3) continue;

      // Use ILIKE for partial matching (PostgreSQL trigram would be better but works for MVP)
      const apps = await prisma.application.findMany({
        where: {
          OR: [
            { normalizedName: { contains: normalized, mode: "insensitive" } },
            {
              aliases: {
                some: {
                  normalizedAlias: {
                    contains: normalized,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          applicationId: true,
          normalizedName: true,
        },
        take: 5,
      });

      for (const app of apps) {
        const similarity = this.calculateSimilarity(
          normalized,
          app.normalizedName,
        );
        if (similarity >= 0.5) {
          results.push({
            applicationId: app.id,
            applicationName: app.name,
            applicationKey: app.applicationId,
            score: Math.round(similarity * 80), // Max 80 for fuzzy
            evidence: [
              `Fuzzy match: "${term}" ~ "${app.name}" (${Math.round(similarity * 100)}% similar)`,
            ],
            matchMethod: "fuzzy",
          });
        }
      }
    }

    return results;
  }

  /**
   * Strategy 5: Historical confirmed mappings from same reporter.
   */
  private async matchByHistory(
    reporterEmail: string,
    title: string,
  ): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    // Find previous confirmed mappings from same reporter
    const previousMappings = await prisma.applicationMapping.findMany({
      where: {
        status: { in: ["HUMAN_CONFIRMED", "AUTO_MATCHED"] },
        applicationId: { not: null },
        externalIssue: { reporterEmail },
      },
      include: {
        application: { select: { id: true, name: true, applicationId: true } },
        externalIssue: { select: { title: true } },
      },
      take: 10,
      orderBy: { resolvedAt: "desc" },
    });

    for (const mapping of previousMappings) {
      if (!mapping.application || !mapping.externalIssue.title) continue;

      const similarity = this.calculateSimilarity(
        normalizeAppName(title),
        normalizeAppName(mapping.externalIssue.title),
      );

      if (similarity >= 0.4) {
        results.push({
          applicationId: mapping.application.id,
          applicationName: mapping.application.name,
          applicationKey: mapping.application.applicationId,
          score: Math.round(60 + similarity * 25), // 60-85 range
          evidence: [
            `Historical: same reporter previously mapped similar ticket to this app`,
            `Previous ticket: "${mapping.externalIssue.title}" (${Math.round(similarity * 100)}% title similarity)`,
          ],
          matchMethod: "historical",
        });
      }
    }

    return results;
  }

  /**
   * Strategy 6: Match by reporter's team → applications owned by team.
   */
  private async matchByReporterTeam(
    reporterEmail: string,
  ): Promise<ResolutionCandidate[]> {
    const results: ResolutionCandidate[] = [];

    const user = await prisma.user.findFirst({
      where: { email: reporterEmail },
      select: { businessUnitId: true },
    });

    if (user?.businessUnitId) {
      const teamApps = await prisma.application.findMany({
        where: { businessUnitId: user.businessUnitId },
        select: { id: true, name: true, applicationId: true },
        take: 3,
      });

      for (const app of teamApps) {
        results.push({
          applicationId: app.id,
          applicationName: app.name,
          applicationKey: app.applicationId,
          score: 30, // Low score — just a weak signal
          evidence: [`Reporter belongs to same BU as application owner`],
          matchMethod: "team",
        });
      }
    }

    return results;
  }

  /**
   * Merge a candidate into the map, keeping the highest score.
   */
  private addCandidate(
    map: Map<string, ResolutionCandidate>,
    candidate: ResolutionCandidate,
  ) {
    const existing = map.get(candidate.applicationId);
    if (!existing) {
      map.set(candidate.applicationId, candidate);
    } else {
      // Merge evidence and keep higher score
      existing.evidence = [
        ...new Set([...existing.evidence, ...candidate.evidence]),
      ];
      if (candidate.score > existing.score) {
        existing.score = candidate.score;
        existing.matchMethod = candidate.matchMethod;
      } else {
        // Boost score for multiple matching strategies
        existing.score = Math.min(
          100,
          existing.score + Math.round(candidate.score * 0.15),
        );
      }
    }
  }

  /**
   * Check if a match is based on deterministic evidence.
   */
  private isDeterministicMatch(candidate: ResolutionCandidate): boolean {
    return [
      "exact_id",
      "exact_name",
      "alias",
      "component",
      "content_name",
    ].includes(candidate.matchMethod);
  }

  /**
   * Simple string similarity (Dice coefficient on bigrams).
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = new Set<string>();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

    const bigramsB = new Set<string>();
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Create or update an application mapping record.
   */
  private async createMapping(
    externalIssueId: string,
    applicationId: string | null,
    status: "AUTO_MATCHED" | "UNRESOLVED",
    confidence: number,
    bestCandidate: ResolutionCandidate,
    allCandidates?: ResolutionCandidate[],
  ) {
    await prisma.applicationMapping.upsert({
      where: { externalIssueId },
      update: {
        applicationId,
        status,
        confidenceScore: confidence,
        matchMethod: bestCandidate.matchMethod,
        evidence: bestCandidate.evidence as unknown as Prisma.InputJsonValue,
        candidates: allCandidates
          ? (allCandidates.slice(0, 5) as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      create: {
        externalIssueId,
        applicationId,
        status,
        confidenceScore: confidence,
        matchMethod: bestCandidate.matchMethod,
        evidence: bestCandidate.evidence as unknown as Prisma.InputJsonValue,
        candidates: allCandidates
          ? (allCandidates.slice(0, 5) as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  /**
   * Record the outcome of AI-assisted resolution.
   *
   * The mapping is only auto-linked when the AI agrees with a deterministic
   * match — an AI pick on its own always goes to the review queue, because the
   * evidence is a judgement about wording rather than an identifier.
   */
  async recordAiResolution(params: {
    externalIssueId: string;
    chosen: ResolutionCandidate | null;
    candidates: ResolutionCandidate[];
    confidence: number;
    explanation: string;
  }) {
    const { externalIssueId, chosen, candidates, confidence, explanation } =
      params;

    const deterministic =
      chosen !== null &&
      this.isDeterministicMatch(chosen) &&
      chosen.score >= AUTO_LINK_THRESHOLD;
    const status: "AUTO_MATCHED" | "UNRESOLVED" = deterministic
      ? "AUTO_MATCHED"
      : "UNRESOLVED";

    const evidence = chosen ? chosen.evidence : [];
    const matchMethod = chosen
      ? deterministic
        ? chosen.matchMethod
        : `ai:${chosen.matchMethod}`
      : "ai";

    const data = {
      applicationId: chosen?.applicationId ?? null,
      status,
      // No application chosen means there is nothing to be confident about. A
      // stored 0 renders as a "0% confidence" badge on a suggestion that was
      // never made; null leaves the badge off entirely.
      confidenceScore: chosen ? confidence : null,
      matchMethod,
      evidence: evidence as unknown as Prisma.InputJsonValue,
      aiExplanation: explanation,
      candidates: candidates.slice(0, 5) as unknown as Prisma.InputJsonValue,
    };

    // A person has already ruled on this ticket. Re-running triage must not
    // undo their decision — record the fresh reasoning and leave the verdict.
    const existing = await prisma.applicationMapping.findUnique({
      where: { externalIssueId },
      select: { status: true },
    });

    if (existing && HUMAN_DECIDED.includes(existing.status)) {
      await prisma.applicationMapping.update({
        where: { externalIssueId },
        data: {
          aiExplanation: explanation,
          candidates: data.candidates,
        },
      });
      return { status: existing.status, autoLinked: false };
    }

    await prisma.applicationMapping.upsert({
      where: { externalIssueId },
      update: data,
      create: { externalIssueId, ...data },
    });

    return { status, autoLinked: deterministic };
  }

  /**
   * Load a mapping the user is allowed to act on.
   *
   * A mapping inherits the reach of the application it points at: reviewing one
   * writes to that application (confirming teaches it an alias), so a reviewer
   * who cannot see the application must not be able to rule on it. Mappings that
   * name no application yet belong to nobody and stay visible to every reviewer —
   * attributing them is the entire point of the queue.
   */
  private async loadMappingForUser(mappingId: string, user: UserContext) {
    const mapping = await prisma.applicationMapping.findUnique({
      where: { id: mappingId },
      include: { externalIssue: { select: { sourceId: true, title: true } } },
    });
    if (!mapping) throw new NotFoundError("Mapping", mappingId);

    if (mapping.applicationId) {
      await this.assertApplicationInScope(mapping.applicationId, user);
    }
    return mapping;
  }

  /**
   * The external issue behind a mapping the user may act on.
   * Used by re-analysis, which spends an AI call against that ticket.
   */
  async assertMappingAccess(mappingId: string, user: UserContext) {
    const mapping = await this.loadMappingForUser(mappingId, user);
    return mapping.externalIssueId;
  }

  /** Reject an application the user cannot reach, without confirming it exists. */
  private async assertApplicationInScope(
    applicationId: string,
    user: UserContext,
  ) {
    if (!getApplicationScopeFilter(user)) return;
    const visible = await prisma.application.findFirst({
      where: scopeApplicationWhere(user, { id: applicationId }),
      select: { id: true },
    });
    if (!visible) throw new NotFoundError("Application", applicationId);
  }

  /**
   * Confirm a mapping (human review).
   */
  async confirmMapping(mappingId: string, user: UserContext) {
    const userId = user.id;
    const mapping = await this.loadMappingForUser(mappingId, user);

    if (!mapping.applicationId)
      throw new ValidationError("No application selected to confirm");

    await prisma.applicationMapping.update({
      where: { id: mappingId },
      data: {
        status: "HUMAN_CONFIRMED",
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    await this.learnAliases(
      mapping.applicationId,
      mapping.externalIssue.title,
      userId,
    );

    await auditService.log({
      userId,
      action: "mapping.confirm",
      entityType: "mapping",
      entityId: mappingId,
      details: {
        applicationId: mapping.applicationId,
        externalIssueId: mapping.externalIssueId,
        sourceId: mapping.externalIssue.sourceId,
      },
    });
  }

  /**
   * Record a name the application is genuinely known by, learned from a
   * confirmed mapping.
   *
   * Previously this stored the whole ticket title and every fragment of it. A
   * ticket titled "internet bank portal - login page needs security check"
   * taught the application the alias "login page needs security check", and the
   * next ticket reusing that generic wording matched it at alias strength (90)
   * — above the auto-link threshold, so it was attributed with no human review.
   * Confirming a mapping was actively degrading the matching it fed.
   *
   * A candidate must now look like a name rather than a sentence, and must be
   * recognisably related to the application it is being attached to. Anything
   * that fails those tests is simply not learned; the mapping is still
   * confirmed.
   */
  private async learnAliases(
    applicationId: string,
    title: string | null,
    userId: string,
  ) {
    if (!title) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { name: true, applicationId: true },
    });
    if (!app) return;

    const appNormalized = normalizeAppName(app.name);
    const appWords = new Set(distinctiveWords(appNormalized));

    for (const term of this.extractAppNames(title)) {
      const normalized = normalizeAppName(term);
      if (!this.isPlausibleAlias(normalized, appNormalized, appWords)) continue;

      const existing = await prisma.applicationAlias.findFirst({
        where: { applicationId, normalizedAlias: normalized },
      });
      if (existing) continue;

      await prisma.applicationAlias.create({
        data: {
          applicationId,
          alias: term.trim(),
          normalizedAlias: normalized,
          source: "AI_LEARNED",
          createdById: userId,
        },
      });
      logger.info(
        { alias: term, applicationId },
        "Learned new alias from confirmed mapping",
      );
    }
  }

  /**
   * Does this phrase look like another name for the application?
   *
   * Three tests, all of which must pass: it is short enough to be a name and not
   * a description; it carries no words that mark it as a request rather than a
   * name; and it shares distinctive vocabulary with the application it would be
   * attached to, so a confirmation cannot teach an unrelated phrase.
   */
  private isPlausibleAlias(
    candidate: string,
    appNormalized: string,
    appWords: Set<string>,
  ): boolean {
    if (candidate.length < 3 || candidate.length > ALIAS_MAX_CHARS)
      return false;
    if (candidate === appNormalized) return false;

    const words = distinctiveWords(candidate);
    if (words.length === 0 || words.length > ALIAS_MAX_WORDS) return false;
    if (words.some((word) => REQUEST_WORDS.has(word))) return false;

    // Must overlap the application's own distinctive vocabulary. Without this,
    // any short phrase in the title becomes a permanent high-confidence match.
    if (appWords.size > 0) {
      const shared = words.filter((word) => appWords.has(word)).length;
      if (shared / words.length < ALIAS_MIN_OVERLAP) return false;
    }

    return true;
  }

  /**
   * Override a mapping with a different application.
   */
  async overrideMapping(
    mappingId: string,
    applicationId: string,
    user: UserContext,
  ) {
    const userId = user.id;
    const mapping = await this.loadMappingForUser(mappingId, user);
    // Both ends are checked: the mapping being moved, and where it is moved to.
    await this.assertApplicationInScope(applicationId, user);

    await prisma.applicationMapping.update({
      where: { id: mappingId },
      data: {
        applicationId,
        status: "HUMAN_OVERRIDDEN",
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    await auditService.log({
      userId,
      action: "mapping.override",
      entityType: "mapping",
      entityId: mappingId,
      details: {
        previousApplicationId: mapping.applicationId,
        newApplicationId: applicationId,
      },
    });
  }

  /**
   * Reject a mapping (no match possible).
   */
  async rejectMapping(mappingId: string, user: UserContext) {
    const userId = user.id;
    await this.loadMappingForUser(mappingId, user);

    await prisma.applicationMapping.update({
      where: { id: mappingId },
      data: {
        status: "REJECTED",
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });

    await auditService.log({
      userId,
      action: "mapping.reject",
      entityType: "mapping",
      entityId: mappingId,
    });
  }

  /**
   * Get the mapping review queue.
   */
  async getReviewQueue(page: number, limit: number, user: UserContext) {
    const where: Prisma.ApplicationMappingWhereInput = {
      status: "UNRESOLVED",
    };

    // Scoped reviewers see the tickets they could own: those pointing at an
    // application inside their scope, plus the ones still unattributed.
    const scope = getApplicationScopeFilter(user);
    if (scope) {
      where.OR = [{ applicationId: null }, { application: scope }];
    }

    const [items, total] = await Promise.all([
      prisma.applicationMapping.findMany({
        where,
        include: {
          externalIssue: {
            select: {
              sourceId: true,
              title: true,
              description: true,
              labels: true,
              components: true,
              reporterEmail: true,
              // The triage is what makes a queue entry reviewable: what the
              // ticket covers and what needs assessing, not just a name guess.
              triage: true,
              triageStatus: true,
              triagedAt: true,
            },
          },
          application: {
            select: { id: true, name: true, applicationId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.applicationMapping.count({ where }),
    ]);

    // Candidate lists are written by triage against the whole inventory, so a
    // scoped reviewer could otherwise read the names of applications they have
    // no access to. Keep only the candidates they are allowed to see.
    const visibleItems = scope
      ? await this.filterCandidates(items, user)
      : items;

    return { items: visibleItems, total };
  }

  /** Strip out-of-scope applications from the stored candidate shortlists. */
  private async filterCandidates<T extends { candidates: unknown }>(
    items: T[],
    user: UserContext,
  ) {
    const ids = new Set<string>();
    for (const item of items) {
      for (const candidate of (item.candidates as
        { applicationId?: string }[] | null) ?? []) {
        if (candidate?.applicationId) ids.add(candidate.applicationId);
      }
    }
    if (ids.size === 0) return items;

    const visible = await prisma.application.findMany({
      where: scopeApplicationWhere(user, { id: { in: [...ids] } }),
      select: { id: true },
    });
    const allowed = new Set(visible.map((a) => a.id));

    return items.map((item) => ({
      ...item,
      candidates: (
        (item.candidates as { applicationId?: string }[] | null) ?? []
      ).filter(
        (candidate) =>
          candidate?.applicationId && allowed.has(candidate.applicationId),
      ),
    }));
  }
}

export const appResolutionService = new AppResolutionService();
