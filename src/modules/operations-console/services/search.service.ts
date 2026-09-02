import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma";

interface SearchResult {
  type: "application" | "assessment" | "vulnerability";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  relevance: number;
}

interface ScopeFilters {
  application?: Prisma.ApplicationWhereInput;
  vulnerability?: Prisma.VulnerabilityWhereInput;
  assessment?: Prisma.AssessmentWhereInput;
}

class SearchService {
  async globalSearch(query: string, limit = 20, scopeFilters?: ScopeFilters): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];

    const searchTerm = query.trim();

    const appSearch: Prisma.ApplicationWhereInput = {
      AND: [
        {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { applicationId: { contains: searchTerm, mode: "insensitive" } },
            { aliases: { some: { alias: { contains: searchTerm, mode: "insensitive" } } } },
          ],
        },
        ...(scopeFilters?.application ? [scopeFilters.application] : []),
      ],
    };

    // Search in parallel across all entity types
    const [apps, assessments, vulns] = await Promise.all([
      // Applications
      prisma.application.findMany({
        where: appSearch,
        select: {
          id: true,
          name: true,
          applicationId: true,
          status: true,
          businessUnit: { select: { name: true } },
        },
        take: limit,
      }),

      // Assessments
      prisma.assessment.findMany({
        where: {
          AND: [
            {
              OR: [
                { title: { contains: searchTerm, mode: "insensitive" } },
                { internalKey: { contains: searchTerm, mode: "insensitive" } },
              ],
            },
            ...(scopeFilters?.assessment ? [scopeFilters.assessment] : []),
          ],
        },
        select: {
          id: true,
          title: true,
          internalKey: true,
          status: true,
          assessmentType: { select: { code: true } },
        },
        take: limit,
      }),

      // Vulnerabilities
      prisma.vulnerability.findMany({
        where: {
          AND: [
            {
              OR: [
                { title: { contains: searchTerm, mode: "insensitive" } },
                { internalKey: { contains: searchTerm, mode: "insensitive" } },
                { cveId: { contains: searchTerm, mode: "insensitive" } },
              ],
            },
            ...(scopeFilters?.vulnerability ? [scopeFilters.vulnerability] : []),
          ],
        },
        select: {
          id: true,
          title: true,
          internalKey: true,
          severity: true,
          status: true,
        },
        take: limit,
      }),
    ]);

    const results: SearchResult[] = [
      ...apps.map((a) => ({
        type: "application" as const,
        id: a.id,
        title: a.name,
        subtitle: `${a.applicationId} | ${a.businessUnit?.name || "No BU"} | ${a.status}`,
        url: `/applications/${a.id}`,
        relevance: a.name.toLowerCase() === searchTerm.toLowerCase() ? 100 : 80,
      })),
      ...assessments.map((a) => ({
        type: "assessment" as const,
        id: a.id,
        title: `${a.internalKey}: ${a.title}`,
        subtitle: `${a.assessmentType?.code || "Assessment"} | ${a.status}`,
        url: `/assessments/${a.id}`,
        relevance: a.internalKey.toLowerCase() === searchTerm.toLowerCase() ? 100 : 70,
      })),
      ...vulns.map((v) => ({
        type: "vulnerability" as const,
        id: v.id,
        title: `${v.internalKey}: ${v.title}`,
        subtitle: `${v.severity} | ${v.status}`,
        url: `/vulnerabilities/${v.id}`,
        relevance: v.internalKey.toLowerCase() === searchTerm.toLowerCase() ? 100 : 70,
      })),
    ];

    // Sort by relevance, limit total
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }
}

export const searchService = new SearchService();
