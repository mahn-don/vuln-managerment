"use client";

import { useTranslation } from "@/lib/i18n";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.settings.systemSettings")}</h1>
        <p className="text-muted-foreground">{t("admin.settings.configureGlobal")}</p>
      </div>
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-muted-foreground">{t("admin.settings.configurePlatform")}</p>
      </div>
    </div>
  );
}
