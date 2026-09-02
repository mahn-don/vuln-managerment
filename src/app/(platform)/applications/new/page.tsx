"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCreateApplication } from "@/lib/queries/applications";
import { useTranslation } from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function NewApplicationPage() {
  const router = useRouter();
  const createApp = useCreateApplication();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    applicationId: "",
    name: "",
    description: "",
    level: "2",
    internetFacing: false,
    dataClassification: "",
    department: "",
    repositoryUrl: "",
    serviceUrl: "",
    productionUrl: "",
    status: "ACTIVE",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await createApp.mutateAsync(form);
      toast.success(t("applications.createdSuccess"));
      router.push(`/applications/${(result as Record<string, unknown>).id}`);
    } catch (error) {
      toast.error((error as Error).message || t("applications.createFailed"));
    }
  };

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/applications" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("applications.addApplication")}</h1>
          <p className="text-muted-foreground">{t("applications.registerNew")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>{t("applications.applicationDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="applicationId">{t("applications.applicationId")} *</Label>
                <Input
                  id="applicationId"
                  placeholder="APP-0001"
                  value={form.applicationId}
                  onChange={(e) => updateField("applicationId", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t("applications.name")} *</Label>
                <Input
                  id="name"
                  placeholder={t("applications.enterAppName")}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("applications.description")}</Label>
              <Textarea
                id="description"
                placeholder={t("applications.description")}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("applications.level")}</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => v && updateField("level", v)}
                >
                  <SelectTrigger>
                    <SelectValue>{t("applications.levelValue", { level: form.level })}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("applications.levelValue", { level: "1" })}</SelectItem>
                    <SelectItem value="2">{t("applications.levelValue", { level: "2" })}</SelectItem>
                    <SelectItem value="3">{t("applications.levelValue", { level: "3" })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("common.status")}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => updateField("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                    <SelectItem value="PLANNING">{t("status.planning")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department">{t("applications.department")}</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataClassification">{t("applications.dataClassification")}</Label>
                <Select
                  value={form.dataClassification}
                  onValueChange={(v) => updateField("dataClassification", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("applications.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">{t("applications.dataPublic")}</SelectItem>
                    <SelectItem value="INTERNAL">{t("applications.dataInternal")}</SelectItem>
                    <SelectItem value="CONFIDENTIAL">{t("applications.dataConfidential")}</SelectItem>
                    <SelectItem value="RESTRICTED">{t("applications.dataRestricted")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="internetFacing"
                checked={form.internetFacing}
                onCheckedChange={(checked) => updateField("internetFacing", !!checked)}
              />
              <Label htmlFor="internetFacing" className="cursor-pointer">
                {t("applications.internetFacing")}
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repositoryUrl">{t("applications.repositoryUrl")}</Label>
              <Input
                id="repositoryUrl"
                type="url"
                placeholder="https://github.com/..."
                value={form.repositoryUrl}
                onChange={(e) => updateField("repositoryUrl", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="serviceUrl">{t("applications.serviceUrl")}</Label>
                <Input
                  id="serviceUrl"
                  type="url"
                  value={form.serviceUrl}
                  onChange={(e) => updateField("serviceUrl", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productionUrl">{t("applications.productionUrl")}</Label>
                <Input
                  id="productionUrl"
                  type="url"
                  value={form.productionUrl}
                  onChange={(e) => updateField("productionUrl", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Link href="/applications" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("common.cancel")}
          </Link>
          <Button type="submit" disabled={createApp.isPending}>
            {createApp.isPending ? t("applications.creating") : t("applications.createApplication")}
          </Button>
        </div>
      </form>
    </div>
  );
}
