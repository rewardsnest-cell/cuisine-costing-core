// Small bridge between the (already-working) downloadFile() popup helper
// and the central saveAndLogDownload() recorder. Use this anywhere we want
// the file to (a) reach the user's device AND (b) appear in the Files &
// Reports hub.

import { downloadFile } from "@/lib/admin/project-audit";
import {
  saveAndLogDownload,
  type DownloadKind,
  type SaveAndLogResult,
} from "@/lib/downloads/save-download";

export type LogAndDownloadInput = {
  content: string | Blob;
  filename: string;
  mimeType?: string;
  kind: DownloadKind;
  module?: string | null;
  recordCount?: number | null;
  parameters?: Record<string, unknown> | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
};

/**
 * Trigger a user-facing download AND log it to user_downloads + storage.
 * The popup-based downloadFile() runs first so the user always gets the
 * file even if storage/log fails. Logging happens in the background.
 */
export async function logAndDownload(
  input: LogAndDownloadInput,
): Promise<SaveAndLogResult> {
  const mime = input.mimeType ?? "application/octet-stream";

  // 1. User-facing download (popup or in-page overlay) — never blocks.
  await downloadFile(input.content, input.filename, mime);

  // 2. Background log + storage upload (don't pop a second download).
  const blob =
    typeof input.content === "string"
      ? new Blob([input.content], { type: mime })
      : input.content;

  return saveAndLogDownload({
    blob,
    filename: input.filename,
    kind: input.kind,
    module: input.module ?? null,
    recordCount: input.recordCount ?? null,
    parameters: input.parameters ?? null,
    sourceId: input.sourceId ?? null,
    sourceLabel: input.sourceLabel ?? null,
    triggerLocalDownload: false, // already handled above
  });
}
