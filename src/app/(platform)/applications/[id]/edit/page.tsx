"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApplication, useUpdateApplication } from "@/lib/queries/applications";
import { useTranslation } from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function EditApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: app, isLoading } = useApplication(id);
  const updateApp = useUpdateApplication();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: "",
    description: "",
    department: "",
    level: "2",
    internetFacing: false,
    dataClassification: "",
    repositoryUrl: "",
    serviceUrl: "",
    productionUrl: "",
    status: "ACTIVE",
    riskRating: "",
  });

  useEffect(() => {
    if (app) {
      setForm({
        name: String(app.name || ""),
        description: String(app.description || ""),
        department: String(app.department || ""),
        level: String(app.level ?? 2),
        internetFacing: Boolean(app.internetFacing),
        dataClassification: String(app.dataClassification || ""),
        repositoryUrl: String(app.repositoryUrl || ""),
        serviceUrl: String(app.serviceUrl || ""),
        productionUrl: String(app.productionUrl || ""),
        status: String(app.status || "ACTIVE"),
        riskRating: String(app.riskRating || ""),
      });
    }
  }, [app]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!app) {
    return <div className="text-destructive">{t("applications.notFound")}</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateApp.mutateAsync({ id, data: form });
      toast.success(t("applications.updatedSuccess"));
      router.push(`/applications/${id}`);
    } catch (error) {
      toast.error(String((error as Error).message));
    }
  };

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/applications/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("applications.editApplication")}</h1>
          <p className="text-muted-foreground">{String(app.applicationId)} — {String(app.name)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle>{t("applications.applicationDetails")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("applications.name")} *</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("applications.description")}</Label>
              <Textarea id="description" value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("applications.level")}</Label>
                <Select value={form.level} onValueChange={(v) => v && updateField("level", v)}>
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
                <Select value={form.status} onValueChange={(v) => v && updateField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                    <SelectItem value="PLANNING">{t("status.planning")}</SelectItem>
                    <SelectItem value="DECOMMISSIONED">{t("status.decommissioned")}</SelectItem>
                    <SelectItem value="ARCHIVED">{t("status.archived")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department">{t("applications.department")}</Label>
                <Input id="department" value={form.department} onChange={(e) => updateField("department", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("applications.dataClassification")}</Label>
                <Select value={form.dataClassification || "none"} onValueChange={(v) => updateField("dataClassification", !v || v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder={t("applications.select")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("common.none")}</SelectItem>
                    <SelectItem value="PUBLIC">{t("applications.dataPublic")}</SelectItem>
                    <SelectItem value="INTERNAL">{t("applications.dataInternal")}</SelectItem>
                    <SelectItem value="CONFIDENTIAL">{t("applications.dataConfidential")}</SelectItem>
                    <SelectItem value="RESTRICTED">{t("applications.dataRestricted")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="internetFacing" checked={form.internetFacing} onCheckedChange={(c) => updateField("internetFacing", !!c)} />
              <Label htmlFor="internetFacing" className="cursor-pointer">{t("applications.internetFacing")}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repositoryUrl">{t("applications.repositoryUrl")}</Label>
              <Input id="repositoryUrl" type="url" value={form.repositoryUrl} onChange={(e) => updateField("repositoryUrl", e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="serviceUrl">{t("applications.serviceUrl")}</Label>
                <Input id="serviceUrl" type="url" value={form.serviceUrl} onChange={(e) => updateField("serviceUrl", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productionUrl">{t("applications.productionUrl")}</Label>
                <Input id="productionUrl" type="url" value={form.productionUrl} onChange={(e) => updateField("productionUrl", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Link href={`/applications/${id}`} className={cn(buttonVariants({ variant: "outline" }))}>{t("common.cancel")}</Link>
          <Button type="submit" disabled={updateApp.isPending}>
            {updateApp.isPending ? t("applications.saving") : t("applications.saveChanges")}
          </Button>
        </div>
      </form>
    </div>
  );
}
