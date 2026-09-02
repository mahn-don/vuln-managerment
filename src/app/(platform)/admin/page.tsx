"use client";

import { useTranslation } from "@/lib/i18n";

export default function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.manageSettings")}</p>
      </div>
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground">{t("admin.title")}</p>
      </div>
    </div>
  );
}
