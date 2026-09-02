import { importService } from "@/modules/integration-engine";
import { createHandler, successResponse } from "@/lib/api";
import { Permission } from "@/modules/platform-services/types/roles";
import { ValidationError } from "@/lib/api/errors";
import { z } from "zod/v4";

const MAX_SIZE = 10 * 1024 * 1024;
const columnMappingSchema = z.record(z.string(), z.string());

export const POST = createHandler(
  async (req, context) => {
    const contentLengthHeader = req.headers.get("content-length");
    const contentLength = Number(contentLengthHeader);
    if (!contentLengthHeader || !Number.isSafeInteger(contentLength) || contentLength <= 0) {
      throw new ValidationError("A valid Content-Length header is required");
    }
    if (contentLength > MAX_SIZE + 1024 * 1024) {
      throw new ValidationError("Request exceeds the 10MB file limit");
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const columnMappingStr = formData.get("columnMapping") as string | null;

    if (!file) throw new ValidationError("No file provided");
    if (!file.name.endsWith(".xlsx")) throw new ValidationError("Only .xlsx files are supported");
    if (file.size > MAX_SIZE) throw new ValidationError("File exceeds 10MB limit");

    const buffer = Buffer.from(await file.arrayBuffer());

    const importId = await importService.upload(buffer, file.name, context.user.id);

    if (columnMappingStr) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(columnMappingStr);
      } catch {
        throw new ValidationError("Invalid columnMapping JSON");
      }
      const result = columnMappingSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError("columnMapping must be a record of string keys to string values");
      }
      const preview = await importService.processAndPreview(importId, buffer, result.data, context.user);
      return successResponse({ importId, preview });
    }

    return successResponse({ importId });
  },
  {
    permission: Permission.IMPORT_EXCEL,
    allowedContentTypes: ["multipart/form-data"],
    requireCsrfHeader: true,
  }
);
