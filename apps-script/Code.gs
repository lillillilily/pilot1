const CONFIG = {
  numGroups: 5,
  sheetName: 'responses',

  // If this script is NOT bound to the target spreadsheet,
  // paste the Spreadsheet ID here and redeploy the web app.
  spreadsheetId: '',

  // Debug helpers
  enableDebugSheet: true,
  debugSheetName: '_debug_log'
};

function doGet(e) {
  const action = sanitize_(e && e.parameter ? e.parameter.action : 'assign') || 'assign';
  const studyId = sanitize_(e && e.parameter ? e.parameter.studyId : 'default_study');
  const workerId = sanitize_(e && e.parameter ? e.parameter.workerId : '');

  logDebug_('doGet:start', { action, studyId, workerId });

  try {
    if (action === 'assign') {
      return jsonOutput_(assignOrLookupParticipant_(studyId, workerId));
    }

    if (action === 'lookup') {
      return jsonOutput_(lookupParticipant_(studyId, workerId));
    }

    if (action === 'submit') {
      const payload = parsePayloadFromRequest_('', e && e.parameter ? e.parameter : {});
      return jsonOutput_(savePayload_(payload));
    }

    return jsonOutput_({ ok: false, error: `Unknown action: ${action}` });
  } catch (error) {
    logDebug_('doGet:error', { message: error.message, stack: error.stack });
    return jsonOutput_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '';
    logDebug_('doPost:raw', { rawBody });

    const payload = parsePayloadFromRequest_(rawBody, e && e.parameter ? e.parameter : {});
    return jsonOutput_(savePayload_(payload));
  } catch (error) {
    logDebug_('doPost:error', { message: error.message, stack: error.stack });
    return jsonOutput_({ ok: false, error: error.message });
  }
}

function savePayload_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const studyId = sanitize_(payload.study_id || 'default_study');

    // Be tolerant here: accept either worker_id or participant_id.
    const workerId = sanitize_(
      (payload.meta && (payload.meta.worker_id || payload.meta.participant_id)) || ''
    );

    if (!workerId) {
      logDebug_('savePayload:missingWorkerId', { payload });
      return { ok: false, error: 'worker_id is required' };
    }

    const sheet = getResponseSheet_();
    const rowIndex = findRowIndex_(sheet, studyId, workerId);
    const existing = rowIndex > 0 ? getRowObject_(sheet, rowIndex) : null;
    const groupId = payload.meta && payload.meta.group_id !== undefined && payload.meta.group_id !== null
      ? Number(payload.meta.group_id)
      : (existing ? Number(existing.groupId) : assignNewGroup_(studyId));

    payload.meta = payload.meta || {};
    payload.meta.worker_id = workerId;
    if (!payload.meta.participant_id) payload.meta.participant_id = workerId;
    payload.meta.group_id = groupId;

    const now = new Date().toISOString();
    const rowValues = [
      studyId,
      workerId,
      groupId,
      existing ? existing.createdAt : now,
      now,
      JSON.stringify(payload)
    ];

    let mode = 'created';
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      mode = 'updated';
    } else {
      sheet.appendRow(rowValues);
    }

    logDebug_('savePayload:success', {
      studyId,
      workerId,
      groupId,
      mode,
      rowIndex: rowIndex > 0 ? rowIndex : sheet.getLastRow(),
      spreadsheetUrl: getSpreadsheet_().getUrl()
    });

    return { ok: true, mode, groupId };
  } finally {
    lock.releaseLock();
  }
}

function parsePayloadFromRequest_(rawBody, params) {
  if (params && params.payload) {
    return safeParseJson_(params.payload, {});
  }

  if (params && params.payloadBase64) {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(params.payloadBase64)).getDataAsString();
    return safeParseJson_(decoded, {});
  }

  const body = String(rawBody || '').trim();
  if (!body) return {};

  if (body.startsWith('{') || body.startsWith('[')) {
    return safeParseJson_(body, {});
  }

  const parsed = {};
  body.split('&').forEach(pair => {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (!rawKey) return;
    parsed[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
  });

  if (parsed.payload) {
    return safeParseJson_(parsed.payload, {});
  }

  return {};
}

function assignOrLookupParticipant_(studyId, workerId) {
  if (!workerId) {
    throw new Error('workerId is required for balanced assignment');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const sheet = getResponseSheet_();
    const rowIndex = findRowIndex_(sheet, studyId, workerId);

    if (rowIndex > 0) {
      const existing = getRowObject_(sheet, rowIndex);
      logDebug_('assign:existing', { studyId, workerId, rowIndex, groupId: existing.groupId });
      return {
        ok: true,
        exists: true,
        groupId: Number(existing.groupId),
        payload: existing.payload
      };
    }

    const groupId = assignNewGroup_(studyId);
    const now = new Date().toISOString();
    sheet.appendRow([studyId, workerId, groupId, now, now, '']);

    logDebug_('assign:new', { studyId, workerId, groupId, rowIndex: sheet.getLastRow() });

    return {
      ok: true,
      exists: false,
      groupId,
      payload: null
    };
  } finally {
    lock.releaseLock();
  }
}

function lookupParticipant_(studyId, workerId) {
  const sheet = getResponseSheet_();
  const rowIndex = findRowIndex_(sheet, studyId, workerId);

  if (rowIndex < 0) {
    return { ok: true, exists: false, payload: null, groupId: null };
  }

  const row = getRowObject_(sheet, rowIndex);
  return {
    ok: true,
    exists: true,
    groupId: Number(row.groupId),
    payload: row.payload
  };
}

function assignNewGroup_(studyId) {
  const props = PropertiesService.getScriptProperties();
  const counterKey = `${studyId}:participantCount`;
  const count = parseInt(props.getProperty(counterKey) || '0', 10);
  const groupId = count % CONFIG.numGroups;
  props.setProperty(counterKey, String(count + 1));
  return groupId;
}

function getSpreadsheet_() {
  if (CONFIG.spreadsheetId) {
    return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('No active spreadsheet found. Set CONFIG.spreadsheetId explicitly.');
  }
  return active;
}

function getResponseSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
    sheet.appendRow(['study_id', 'worker_id', 'group_id', 'created_at', 'updated_at', 'payload_json']);
  }

  return sheet;
}

function findRowIndex_(sheet, studyId, workerId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === studyId && String(values[i][1]).trim() === workerId) {
      return i + 2;
    }
  }
  return -1;
}

function getRowObject_(sheet, rowIndex) {
  const [studyId, workerId, groupId, createdAt, updatedAt, payloadJson] =
    sheet.getRange(rowIndex, 1, 1, 6).getValues()[0];

  return {
    studyId,
    workerId,
    groupId,
    createdAt,
    updatedAt,
    payload: safeParseJson_(payloadJson, null)
  };
}

function sanitize_(value) {
  return String(value || '').trim();
}

function safeParseJson_(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch (error) {
    logDebug_('safeParseJson:error', { text, message: error.message });
    return fallback;
  }
}

function logDebug_(tag, data) {
  const message = `${tag} :: ${JSON.stringify(data || {})}`;
  Logger.log(message);

  if (!CONFIG.enableDebugSheet) return;

  try {
    const spreadsheet = getSpreadsheet_();
    let sheet = spreadsheet.getSheetByName(CONFIG.debugSheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.debugSheetName);
      sheet.appendRow(['timestamp', 'tag', 'data']);
    }
    sheet.appendRow([new Date().toISOString(), tag, JSON.stringify(data || {})]);
  } catch (error) {
    Logger.log(`debug-log-write-failed :: ${error.message}`);
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this manually inside Apps Script to verify sheet writing without GitHub Pages.
function testDoPost_() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        study_id: 'exp1_scene_perception',
        meta: {
          participant_id: 'DEBUG-001',
          worker_id: 'DEBUG-001',
          group_id: 0
        },
        trials: [
          {
            trial_slot: 's1',
            q1_state: 'moving',
            q2_axis: 'right',
            q4_confidence: 3
          }
        ],
        comments: {
          difficult_images: 'debug run',
          other_feedback: ''
        }
      })
    }
  };

  const res = doPost(fakeEvent);
  Logger.log(res.getContent());
}

function testLookup_() {
  const res = doGet({ parameter: { action: 'lookup', studyId: 'exp1_scene_perception', workerId: 'DEBUG-001' } });
  Logger.log(res.getContent());
}
