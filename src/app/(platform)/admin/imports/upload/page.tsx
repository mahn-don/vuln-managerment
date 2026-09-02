"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ArrowLeft, Upload, FileSpreadsheet, Check, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

type Step = "upload" | "mapping" | "preview" | "result";

/**
 * Reconciliation outcome is workflow, not risk. Only rows that need a human —
 * invalid, duplicate, removed — carry any colour.
 */
const statusColors: Record<string, string> = {
  NEW: "bg-muted text-muted-foreground",
  UPDATED: "bg-muted text-muted-foreground",
  UNCHANGED: "bg-muted text-muted-foreground",
  INVALID: "bg-risk-critical-surface text-risk-critical",
  DUPLICATE: "bg-risk-medium-surface text-risk-medium",
  REMOVED: "bg-risk-high-surface text-risk-high",
};

const defaultColumnMap: Record<string, string> = {
  "Application ID": "applicationId",
  "App ID": "applicationId",
  "Application Name": "name",
  "App Name": "name",
  "Name": "name",
  "Description": "description",
  "Business Unit": "businessUnit",
  "Department": "department",
  "Criticality": "level",
  "Level": "level",
  "Internet Facing": "internetFacing",
  "Data Classification": "dataClassification",
  "Repository": "repositoryUrl",
  "Repository URL": "repositoryUrl",
  "Service URL": "serviceUrl",
  "Production URL": "productionUrl",
  "Status": "status",
  "Risk Rating": "riskRating",
  "Go-Live Date": "goLiveDate",
};

export default function ImportUploadPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    summary: Record<string, number>;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".xlsx")) {
      toast.error(t("admin.imports.onlyXlsx"));
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error(t("admin.imports.fileExceedsLimit"));
      return;
    }
    setFile(f);
  }, []);

  const handleUploadAndPreview = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("columnMapping", JSON.stringify(defaultColumnMap));

      const res = await fetch("/api/v1/imports/upload", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        body: formData,
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error?.message || "Upload failed");

      setImportId(data.data.importId);
      setPreview(data.data.preview);
      setStep("preview");
    } catch (error) {
      toast.error(String((error as Error).message));
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importId) return;
    setImporting(true);

    try {
      const res = await fetch(`/api/v1/imports/${importId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error?.message || "Import failed");

      setResult(data.data);
      setStep("result");
      toast.success(t("admin.imports.importSuccess"));
    } catch (error) {
      toast.error(String((error as Error).message));
    } finally {
      setImporting(false);
    }
  };

  const progressValue = step === "upload" ? 25 : step === "mapping" ? 50 : step === "preview" ? 75 : 100;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/imports" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.imports.importAppInventory")}</h1>
          <p className="text-muted-foreground">{t("admin.imports.uploadAndReconcile")}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span className={step === "upload" ? "font-semibold text-foreground" : ""}>1. {t("admin.imports.upload")}</span>
          <span className={step === "preview" ? "font-semibold text-foreground" : ""}>2. {t("admin.imports.preview")}</span>
          <span className={step === "result" ? "font-semibold text-foreground" : ""}>3. {t("admin.imports.result")}</span>
        </div>
        <Progress value={progressValue} />
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {t("admin.imports.uploadExcelFile")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12">
              {!file ? (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{t("admin.imports.dragAndDrop")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("admin.imports.clickToBrowse")}</p>
                  <label className={cn(buttonVariants({ variant: "outline" }), "mt-4 cursor-pointer")}>
                    {t("admin.imports.browseFiles")}
                    <input type="file" accept=".xlsx" className="hidden" onChange={handleFileSelect} />
                  </label>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" onClick={() => setFile(null)}>
                      {t("admin.imports.changeFile")}
                    </Button>
                    <Button onClick={handleUploadAndPreview} disabled={importing}>
                      {importing ? t("admin.imports.processing") : t("admin.imports.uploadAndPreview")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.imports.importPreview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                {Object.entries(preview.summary).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <p className="text-2xl font-bold">{count}</p>
                    <Badge className={cn("mt-1", statusColors[status])}>{status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Row details */}
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.imports.changes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">{t("admin.imports.row")}</TableHead>
                      <TableHead className="w-24">{t("admin.imports.status")}</TableHead>
                      <TableHead>{t("admin.imports.applicationId")}</TableHead>
                      <TableHead>{t("admin.imports.name")}</TableHead>
                      <TableHead>{t("admin.imports.details")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview.rows as Record<string, unknown>[])
                      .filter((r) => r.status !== "UNCHANGED")
                      .slice(0, 100)
                      .map((row, i) => {
                        const raw = row.rawData as Record<string, unknown>;
                        const changes = row.changes as Record<string, { old: unknown; new: unknown }> | undefined;
                        const errors = row.validationErrors as { field: string; message: string }[] | undefined;

                        return (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{String(row.rowNumber)}</TableCell>
                            <TableCell>
                              <Badge className={cn("text-xs", statusColors[String(row.status)])}>
                                {String(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {String(raw.applicationId || raw["Application ID"] || raw["App ID"] || "--")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {String(raw.name || raw["Application Name"] || raw["App Name"] || "--")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {changes && Object.entries(changes).map(([field, { old: o, new: n }]) => (
                                <div key={field}>
                                  {field}: {String(o || "(empty)")} &rarr; {String(n)}
                                </div>
                              ))}
                              {errors && errors.map((e, j) => (
                                <div key={j} className="text-risk-critical">{e.field}: {e.message}</div>
                              ))}
                              {row.status === "REMOVED" && t("admin.imports.notInFile")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setStep("upload"); setPreview(null); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmImport} disabled={importing}>
              {importing ? t("admin.imports.importing") : t("admin.imports.confirmImport")}
            </Button>
          </div>
        </>
      )}

      {/* Step: Result */}
      {step === "result" && result && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-risk-ok/12">
              <Check className="h-8 w-8 text-risk-ok" />
            </div>
            <h2 className="text-xl font-semibold">{t("admin.imports.importComplete")}</h2>
            <div className="mt-4 flex justify-center gap-8">
              <div>
                <p className="tnum text-3xl font-bold text-risk-ok">{result.created}</p>
                <p className="text-sm text-muted-foreground">{t("admin.imports.created")}</p>
              </div>
              <div>
                <p className="tnum text-3xl font-bold text-risk-low">{result.updated}</p>
                <p className="text-sm text-muted-foreground">{t("admin.imports.updated")}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/applications" className={cn(buttonVariants())}>
                {t("admin.imports.viewApplications")}
              </Link>
              <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setPreview(null); setResult(null); }}>
                {t("admin.imports.importAnother")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
