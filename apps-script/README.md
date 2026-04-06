# Apps Script Debug Copy

This folder stores a local debug copy of the Google Apps Script backend.

## Files
- `Code.gs`: safer debug version of the submit/lookup backend

## What changed
- accepts `participant_id` as fallback when `worker_id` is missing
- logs every assign/post step to `Logger` and optionally `_debug_log` sheet
- allows explicit `CONFIG.spreadsheetId` so the web app writes to the intended spreadsheet
- includes `testDoPost_()` and `testLookup_()` helper functions

## How to use
1. Open your Apps Script project.
2. Replace the current `Code.gs` with the contents of `apps-script/Code.gs`.
3. If the script is standalone, fill `CONFIG.spreadsheetId`.
4. Run `testDoPost_()` once from the Apps Script editor.
5. Check:
   - `responses` sheet
   - `_debug_log` sheet
   - `Executions` in Apps Script
6. Redeploy the web app after saving.

## Important
If `assign` works but submit does not write to the sheet, the usual causes are:
- web app deployed from an older version
- wrong spreadsheet target (`getActiveSpreadsheet()` mismatch)
- missing `worker_id` / `participant_id` in payload
- silent JSON parse issue from old `payload_json`
