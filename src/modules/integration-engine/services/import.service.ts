import { prisma } from "@/lib/db/prisma";
import { auditService } from "@/modules/platform-services/services/audit.service";
import { appResolutionService } from "@/modules/intelligence-engine/services/app-resolution.service";
import { normalizeAppName } from "@/lib/utils/normalize";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { Prisma, ImportRowStatus } from "@/generated/prisma";
import ExcelJS from "exceljs";
import { createHash } from "crypto";
import {
  scopeApplicationWhere,
  type UserContext,
} from "@/modules/platform-services/middleware/abac.middleware";

interface ColumnMapping {
  [excelColumn: string]: string; // Excel column name → internal field name
}

interface ParsedRow {
  rowNumber: number;
  rawData: Record<string, unknown>;
  applicationId?: string;
  name?: string;
  normalizedName?: string;
  [key: string]: unknown;
}

interface ImportPreviewRow {
  rowNumber: number;
  status: ImportRowStatus;
  rawData: Record<string, unknown>;
  matchedApplicationId?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  validationErrors?: { field: string; message: string }[];
}

const INTERNAL_FIELDS = [
  "applicationId", "name", "description", "department", "level",
  "internetFacing", "dataClassification", "technologyStack", "repositoryUrl",
  "serviceUrl", "productionUrl", "status", "goLiveDate", "riskRating",
  "complianceScope",
] as const;

const REQUIRED_FIELDS = ["applicationId", "name"] as const;

/** Accepted in a "level" column: 1-3, or the words the old scale used. */
const VALID_LEVELS = ["1", "2", "3", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const VALID_STATUSES = ["ACTIVE", "DECOMMISSIONED", "PLANNING", "ARCHIVED"];
const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_WORKSHEET_ROWS = 10_000;
const MAX_WORKSHEET_COLUMNS = 100;
const PREVIEW_PAGE_SIZE = 500;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;

function importRecordWhere(importId: string, user: UserContext): Prisma.AssetImportWhereInput {
  return ["SYSTEM_ADMIN", "SECURITY_ADMIN"].includes(user.role)
    ? { id: importId }
    : { id: importId, importedById: user.id };
}

function assertSafeXlsxArchive(fileBuffer: Buffer): void {
  if (fileBuffer.length < 22 || fileBuffer.readUInt32LE(0) !== 0x04034b50) {
    throw new ValidationError("File is not a valid XLSX archive");
  }

  const minimumOffset = Math.max(0, fileBuffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = fileBuffer.length - 22; offset >= minimumOffset; offset--) {
    if (fileBuffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new ValidationError("XLSX archive directory is missing");

  const entryCount = fileBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = fileBuffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new ValidationError("XLSX archive contains too many entries");
  }

  let totalUncompressed = 0;
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > fileBuffer.length || fileBuffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new ValidationError("XLSX archive directory is malformed");
    }
    const compressedSize = fileBuffer.readUInt32LE(offset + 20);
    const uncompressedSize = fileBuffer.readUInt32LE(offset + 24);
    const fileNameLength = fileBuffer.readUInt16LE(offset + 28);
    const extraLength = fileBuffer.readUInt16LE(offset + 30);
    const commentLength = fileBuffer.readUInt16LE(offset + 32);
    totalUncompressed += uncompressedSize;

    if (
      totalUncompressed > MAX_UNCOMPRESSED_BYTES ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 200)
    ) {
      throw new ValidationError("XLSX archive expands beyond the safe processing limit");
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
}

class ImportService {
  /**
   * Step 1: Upload and create import record
   */
  async upload(file: Buffer, fileName: string, userId: string): Promise<string> {
    const fileHash = createHash("sha256").update(file).digest("hex");

    // Check for duplicate upload
    const existingImport = await prisma.assetImport.findFirst({
      where: { fileHash, status: { in: ["COMPLETED"] } },
    });
    if (existingImport) {
      throw new ValidationError(
        `This file was already imported on ${existingImport.completedAt?.toLocaleDateString()}`
      );
    }

    const importRecord = await prisma.assetImport.create({
      data: {
        fileName,
        fileSize: file.length,
        fileHash,
        status: "UPLOADED",
        importedById: userId,
      },
    });

    await auditService.log({
      userId,
      action: "import.upload",
      entityType: "import",
      entityId: importRecord.id,
      details: { fileName, fileSize: file.length },
    });

    return importRecord.id;
  }

  /**
   * Step 2: Parse, validate, and generate preview
   */
  async processAndPreview(
    importId: string,
    fileBuffer: Buffer,
    columnMapping: ColumnMapping,
    user: UserContext
  ): Promise<{
    summary: Record<string, number>;
    rows: ImportPreviewRow[];
  }> {
    const importRecord = await prisma.assetImport.findFirst({ where: importRecordWhere(importId, user) });
    if (!importRecord) throw new NotFoundError("Import", importId);

    await prisma.assetImport.update({
      where: { id: importId },
      data: { status: "VALIDATING", columnMapping: columnMapping as unknown as Prisma.InputJsonValue },
    });

    // Guard against zip-bomb / XML-bomb
    if (fileBuffer.byteLength > MAX_COMPRESSED_BYTES) {
      throw new ValidationError("File buffer exceeds 10MB limit");
    }
    assertSafeXlsxArchive(fileBuffer);

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    } catch (err) {
      throw new ValidationError(`Failed to parse Excel file: ${(err as Error).message}`);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new ValidationError("No worksheet found in the Excel file");
    if (worksheet.rowCount > MAX_WORKSHEET_ROWS || worksheet.columnCount > MAX_WORKSHEET_COLUMNS) {
      throw new ValidationError(
        `Worksheet exceeds the ${MAX_WORKSHEET_ROWS}-row or ${MAX_WORKSHEET_COLUMNS}-column limit`
      );
    }

    // Get headers
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || "").trim();
    });

    // Parse rows
    const parsedRows: ParsedRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rawData: Record<string, unknown> = {};
      const mapped: Record<string, unknown> = {};

      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        if (!header) return;

        const value = cell.value;
        rawData[header] = value;

        const internalField = columnMapping[header];
        if (internalField) {
          mapped[internalField] = typeof value === "object" && value !== null
            ? String(value)
            : value;
        }
      });

      parsedRows.push({
        rowNumber,
        rawData,
        ...mapped,
        normalizedName: mapped.name ? normalizeAppName(String(mapped.name)) : undefined,
      });
    });

    // Load only the applications that could match rows in this import
    const importAppIds = parsedRows
      .map((r) => String(r.applicationId || "").trim())
      .filter(Boolean);
    const importNormalizedNames = parsedRows
      .map((r) => r.normalizedName)
      .filter((n): n is string => !!n);

    const existingApps = await prisma.application.findMany({
      where: scopeApplicationWhere(user, {
        OR: [
          ...(importAppIds.length > 0 ? [{ applicationId: { in: importAppIds } }] : []),
          ...(importNormalizedNames.length > 0 ? [{ normalizedName: { in: importNormalizedNames } }] : []),
        ],
      }),
      select: {
        id: true,
        applicationId: true,
        name: true,
        normalizedName: true,
        description: true,
        department: true,
        level: true,
        internetFacing: true,
        dataClassification: true,
        repositoryUrl: true,
        serviceUrl: true,
        productionUrl: true,
        status: true,
        goLiveDate: true,
        riskRating: true,
      },
    });

    const appByAppId = new Map(existingApps.map((a) => [a.applicationId, a]));
    const appByNormalizedName = new Map(existingApps.map((a) => [a.normalizedName, a]));
    const existingAppIds = new Set(existingApps.map((a) => a.applicationId));

    // Track which existing apps appear in the import
    const seenAppIds = new Set<string>();
    const seenNormalizedNames = new Set<string>();

    // Process each row
    const previewRows: ImportPreviewRow[] = [];

    for (const row of parsedRows) {
      const errors: { field: string; message: string }[] = [];

      // Validate required fields
      for (const field of REQUIRED_FIELDS) {
        if (!row[field] || String(row[field]).trim() === "") {
          errors.push({ field, message: `${field} is required` });
        }
      }

      // Validate enum fields
      if (row.level && !VALID_LEVELS.includes(String(row.level).toUpperCase().trim())) {
        errors.push({ field: "level", message: `Invalid level: ${row.level}. Use 1, 2 or 3.` });
      }
      if (row.status && !VALID_STATUSES.includes(String(row.status).toUpperCase())) {
        errors.push({ field: "status", message: `Invalid status: ${row.status}` });
      }

      // Check for duplicates within the file
      const appId = row.applicationId ? String(row.applicationId).trim() : undefined;
      const normalizedName = row.normalizedName;

      if (appId && seenAppIds.has(appId)) {
        const preview: ImportPreviewRow = {
          rowNumber: row.rowNumber,
          status: "DUPLICATE",
          rawData: row.rawData,
          validationErrors: [{ field: "applicationId", message: `Duplicate application ID: ${appId}` }],
        };
        previewRows.push(preview);
        continue;
      }

      if (normalizedName && seenNormalizedNames.has(normalizedName)) {
        errors.push({ field: "name", message: "Possible duplicate name in file" });
      }

      if (appId) seenAppIds.add(appId);
      if (normalizedName) seenNormalizedNames.add(normalizedName);

      // Invalid row
      if (errors.length > 0 && errors.some((e) => REQUIRED_FIELDS.includes(e.field as typeof REQUIRED_FIELDS[number]))) {
        previewRows.push({
          rowNumber: row.rowNumber,
          status: "INVALID",
          rawData: row.rawData,
          validationErrors: errors,
        });
        continue;
      }

      // Identity resolution
      let matchedApp = appId ? appByAppId.get(appId) : undefined;
      if (!matchedApp && normalizedName) {
        matchedApp = appByNormalizedName.get(normalizedName);
      }

      if (matchedApp) {
        // Existing application — compute diff
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        const fieldMap: Record<string, string> = {
          name: "name", description: "description", department: "department",
          level: "level", internetFacing: "internetFacing",
          dataClassification: "dataClassification", repositoryUrl: "repositoryUrl",
          serviceUrl: "serviceUrl", productionUrl: "productionUrl",
          status: "status", riskRating: "riskRating",
        };

        for (const [importField, dbField] of Object.entries(fieldMap)) {
          if (row[importField] !== undefined && row[importField] !== null) {
            const newVal = String(row[importField]).trim();
            const oldVal = (matchedApp as Record<string, unknown>)[dbField];
            const oldStr = oldVal !== null && oldVal !== undefined ? String(oldVal) : "";

            if (newVal !== oldStr && newVal !== "") {
              changes[dbField] = { old: oldVal, new: row[importField] };
            }
          }
        }

        previewRows.push({
          rowNumber: row.rowNumber,
          status: Object.keys(changes).length > 0 ? "UPDATED" : "UNCHANGED",
          rawData: row.rawData,
          matchedApplicationId: matchedApp.id,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
          validationErrors: errors.length > 0 ? errors : undefined,
        });
      } else {
        // New application
        previewRows.push({
          rowNumber: row.rowNumber,
          status: "NEW",
          rawData: row.rawData,
          validationErrors: errors.length > 0 ? errors : undefined,
        });
      }
    }

    // Detect removed applications (in DB but not in file)
    for (const app of existingApps) {
      if (app.status === "ARCHIVED" || app.status === "DECOMMISSIONED") continue;
      if (!seenAppIds.has(app.applicationId)) {
        previewRows.push({
          rowNumber: -1,
          status: "REMOVED",
          rawData: { applicationId: app.applicationId, name: app.name },
          matchedApplicationId: app.id,
        });
      }
    }

    // Save preview rows in bulk
    await prisma.assetImportRow.deleteMany({ where: { importId } });
    if (previewRows.length > 0) {
      await prisma.assetImportRow.createMany({
        data: previewRows.map((row) => ({
          importId,
          rowNumber: row.rowNumber,
          rawData: row.rawData as Prisma.InputJsonValue,
          status: row.status,
          applicationId: row.matchedApplicationId,
          changes: (row.changes as Prisma.InputJsonValue) ?? undefined,
          validationErrors: (row.validationErrors as unknown as Prisma.InputJsonValue) ?? undefined,
        })),
      });
    }

    // Summary
    const summary: Record<string, number> = { NEW: 0, UPDATED: 0, UNCHANGED: 0, INVALID: 0, DUPLICATE: 0, REMOVED: 0 };
    for (const row of previewRows) {
      summary[row.status] = (summary[row.status] || 0) + 1;
    }

    await prisma.assetImport.update({
      where: { id: importId },
      data: {
        status: "PREVIEWING",
        totalRows: parsedRows.length,
        newCount: summary.NEW,
        updatedCount: summary.UPDATED,
        unchangedCount: summary.UNCHANGED,
        invalidCount: summary.INVALID,
        duplicateCount: summary.DUPLICATE,
        removedCount: summary.REMOVED,
      },
    });

    return { summary, rows: previewRows.slice(0, PREVIEW_PAGE_SIZE) };
  }

  /**
   * Step 3: Get preview for display
   */
  async getPreview(importId: string, user: UserContext) {
    const importRecord = await prisma.assetImport.findFirst({
      where: importRecordWhere(importId, user),
      include: {
        rows: {
          orderBy: [{ status: "asc" }, { rowNumber: "asc" }],
          take: PREVIEW_PAGE_SIZE,
          include: {
            application: { select: { name: true, applicationId: true } },
          },
        },
        importedBy: { select: { displayName: true } },
      },
    });

    if (!importRecord) throw new NotFoundError("Import", importId);
    return importRecord;
  }

  /**
   * Step 4: Confirm and apply import
   */
  async confirmImport(importId: string, user: UserContext) {
    if (user.role === "SECURITY_MANAGER" && !user.businessUnitId) {
      throw new ValidationError("A business unit assignment is required to import applications");
    }
    const importRecord = await prisma.assetImport.findFirst({
      where: importRecordWhere(importId, user),
      include: { rows: { where: { isIncluded: true } } },
    });

    if (!importRecord) throw new NotFoundError("Import", importId);
    if (importRecord.status !== "PREVIEWING") {
      throw new ValidationError(`Import is in '${importRecord.status}' state, not PREVIEWING`);
    }

    const updatedApplicationIds = importRecord.rows.flatMap((row) =>
      row.status === "UPDATED" && row.applicationId ? [row.applicationId] : []
    );
    if (updatedApplicationIds.length > 0) {
      const visibleCount = await prisma.application.count({
        where: scopeApplicationWhere(user, { id: { in: updatedApplicationIds } }),
      });
      if (visibleCount !== new Set(updatedApplicationIds).size) {
        throw new NotFoundError("Application");
      }
    }

    await prisma.assetImport.update({
      where: { id: importId },
      data: { status: "IMPORTING", startedAt: new Date() },
    });

    let created = 0;
    let updated = 0;

    try {
      await prisma.$transaction(async (tx) => {
        for (const row of importRecord.rows) {
          const rawData = row.rawData as Record<string, unknown>;

          if (row.status === "NEW") {
            const appId = String(rawData.applicationId || rawData["Application ID"] || "").trim();
            const name = String(rawData.name || rawData["Application Name"] || "").trim();

            if (!appId || !name) continue;

            await tx.application.create({
              data: {
                applicationId: appId,
                name,
                normalizedName: normalizeAppName(name),
                description: rawData.description ? String(rawData.description) : undefined,
                department: rawData.department ? String(rawData.department) : undefined,
                level: this.parseLevel(rawData.level),
                internetFacing: Boolean(rawData.internetFacing),
                dataClassification: rawData.dataClassification ? String(rawData.dataClassification) : undefined,
                repositoryUrl: rawData.repositoryUrl ? String(rawData.repositoryUrl) : undefined,
                status: "ACTIVE",
                businessUnitId: user.role === "SECURITY_MANAGER" ? user.businessUnitId : undefined,
                lastImportId: importId,
                createdById: user.id,
                updatedById: user.id,
              },
            });
            created++;
          } else if (row.status === "UPDATED" && row.applicationId && row.changes) {
            const changes = row.changes as Record<string, { old: unknown; new: unknown }>;
            const updateData: Record<string, unknown> = {};

            for (const [field, change] of Object.entries(changes)) {
              if (field === "level") {
                updateData[field] = this.parseLevel(change.new);
              } else if (field === "internetFacing") {
                updateData[field] = Boolean(change.new);
              } else if (field === "name") {
                updateData[field] = change.new;
                updateData.normalizedName = normalizeAppName(String(change.new));
              } else {
                updateData[field] = change.new;
              }
            }

            updateData.lastImportId = importId;
            updateData.updatedById = user.id;

            await tx.application.update({
              where: { id: row.applicationId },
              data: updateData as Prisma.ApplicationUpdateInput,
            });
            updated++;
          }
        }
      });

      await prisma.assetImport.update({
        where: { id: importId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          newCount: created,
          updatedCount: updated,
        },
      });

      // The recall pass ranks tickets against a cached view of the inventory.
      // An import has just changed that inventory, so drop it now rather than
      // suggesting from a stale list for the rest of the TTL.
      appResolutionService.invalidateInventoryIndex();

      await auditService.log({
        userId: user.id,
        action: "import.confirm",
        entityType: "import",
        entityId: importId,
        details: { created, updated, fileName: importRecord.fileName },
      });

      return { created, updated };
    } catch (error) {
      await prisma.assetImport.update({
        where: { id: importId },
        data: { status: "FAILED", validationErrors: { error: String(error) } as unknown as Prisma.InputJsonValue },
      });
      throw error;
    }
  }

  /**
   * Get import history
   */
  async getHistory(page: number, limit: number, user: UserContext) {
    const where: Prisma.AssetImportWhereInput = ["SYSTEM_ADMIN", "SECURITY_ADMIN"].includes(user.role)
      ? {}
      : { importedById: user.id };
    const [items, total] = await Promise.all([
      prisma.assetImport.findMany({
        where,
        include: { importedBy: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetImport.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Application level from a spreadsheet cell.
   *
   * Accepts a bare 1-3 and also the words the old four-point criticality scale
   * used, so inventory workbooks written before the change still import: the
   * two "important" grades both land on level 1, matching the data migration.
   */
  private parseLevel(value: unknown): number {
    if (value === null || value === undefined || String(value).trim() === "") return 2;

    const text = String(value).toUpperCase().trim();
    const numeric = Number(text);
    if (numeric === 1 || numeric === 2 || numeric === 3) return numeric;

    if (text === "CRITICAL" || text === "HIGH") return 1;
    if (text === "MEDIUM") return 2;
    if (text === "LOW") return 3;
    return 2;
  }
}

export const importService = new ImportService();
