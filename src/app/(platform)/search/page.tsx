"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/data-display/empty-state";
import { Search, Server, ClipboardCheck, Bug } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface SearchResult {
  type: "application" | "assessment" | "vulnerability";
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const typeIcons: Record<string, typeof Server> = {
  application: Server,
  assessment: ClipboardCheck,
  vulnerability: Bug,
};

const typeColors: Record<string, string> = {
  application: "bg-muted text-muted-foreground",
  assessment: "bg-muted text-muted-foreground",
  vulnerability: "bg-muted text-muted-foreground",
};

function SearchResults() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const typeLabels: Record<string, string> = {
    application: t("nav.applications"),
    assessment: t("nav.assessments"),
    vulnerability: t("nav.vulnerabilities"),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: async () => {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=30`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data as SearchResult[];
    },
    enabled: query.length >= 2,
  });

  const results = data || [];
  const grouped = results.reduce(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {} as Record<string, SearchResult[]>
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("search.searchResults")}</h1>
        <p className="text-muted-foreground">
          {query ? t("search.showingResultsFor", { query }) : t("search.enterQueryInTopBar")}
          {results.length > 0 && ` (${results.length} ${t("search.results")})`}
        </p>
      </div>

      {!query || query.length < 2 ? (
        <EmptyState
          icon={Search}
          title={t("search.enterSearchQuery")}
          description={t("search.searchDescription")}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("common.noResults")}
          description={t("search.noMatchesFor", { query })}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = typeIcons[type] || Search;
            return (
              <div key={type}>
                <div className="mb-3 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">{typeLabels[type] || type}</h2>
                  <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                </div>
                <div className="space-y-1">
                  {items.map((result) => (
                    <Link
                      key={result.id}
                      href={result.url}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <Badge className={typeColors[result.type] || ""}>{typeLabels[result.type] || result.type}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
