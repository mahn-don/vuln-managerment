import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
    isPositive?: boolean; // Is the trend direction good? (e.g., vulns going down is positive)
  };
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function KPICard({ title, value, subtitle, trend, icon: Icon, className }: KPICardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="tnum text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {Icon && (
            <div className="rounded-md bg-primary/10 p-2">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-sm">
            {trend.direction === "up" && (
              <TrendingUp
                className={cn("h-4 w-4", trend.isPositive ? "text-risk-ok" : "text-risk-critical")}
              />
            )}
            {trend.direction === "down" && (
              <TrendingDown
                className={cn("h-4 w-4", trend.isPositive ? "text-risk-ok" : "text-risk-critical")}
              />
            )}
            {trend.direction === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
            <span
              className={cn(
                "tnum font-medium",
                trend.isPositive ? "text-risk-ok" : trend.direction === "flat" ? "text-muted-foreground" : "text-risk-critical"
              )}
            >
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
