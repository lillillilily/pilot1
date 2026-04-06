const CONFIG = {
  numGroups: 5,
  sheetName: 'responses',
  trialSheetName: 'trials_long',
  storeRawPayload: true,

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

    payload.meta = payload.meta || {};
    payload.meta.worker_id = workerId;
    if (!payload.meta.participant_id) payload.meta.participant_id = workerId;

    const responseSheet = getResponseSheet_();
    const rowIndex = findRowIndex_(responseSheet, studyId, workerId);
    const existing = rowIndex > 0 ? getRowObject_(responseSheet, rowIndex) : null;
    const groupId = payload.meta.group_id !== undefined && payload.meta.group_id !== null
      ? Number(payload.meta.group_id)
      : (existing ? Number(existing.groupId) : assignNewGroup_(studyId));

    payload.meta.group_id = groupId;

    const participantRecord = buildParticipantRecord_(payload, existing);
    const savedRowIndex = upsertRecord_(
      responseSheet,
      rowIndex,
      participantRecord,
      getResponseHeaders_()
    );

    replaceTrialRows_(payload);

    const mode = rowIndex > 0 ? 'updated' : 'created';
    logDebug_('savePayload:success', {
      studyId,
      workerId,
      groupId,
      mode,
      rowIndex: savedRowIndex,
      spreadsheetUrl: getSpreadsheet_().getUrl(),
      responseSheet: CONFIG.sheetName,
      trialSheet: CONFIG.trialSheetName
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
    const rowIndexNew = upsertRecord_(
      sheet,
      -1,
      buildPlaceholderRecord_(studyId, workerId, groupId, now),
      getResponseHeaders_()
    );

    logDebug_('assign:new', { studyId, workerId, groupId, rowIndex: rowIndexNew });

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
  }

  ensureSheetHeaders_(sheet, getResponseHeaders_());
  return sheet;
}

function getTrialSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.trialSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.trialSheetName);
  }

  ensureSheetHeaders_(sheet, getTrialHeaders_());
  return sheet;
}

function getResponseHeaders_() {
  return [
    'study_id',
    'worker_id',
    'group_id',
    'created_at',
    'updated_at',
    'payload_json',
    'participant_id',
    'submitted_at',
    'experience',
    'self_report_careful',
    'self_report_visibility',
    'comment_difficult_images',
    'comment_other_feedback',
    'num_trials'
  ];
}

function getTrialHeaders_() {
  return [
    'study_id',
    'worker_id',
    'participant_id',
    'group_id',
    'experience',
    'submitted_at',
    'trial_slot',
    'scene_id',
    'scene_number',
    'blur_level',
    'blur_id',
    'image_path',
    'q1_state',
    'q2_axis',
    'q3_cues',
    'q4_confidence',
    'trial_start_ms',
    'first_response_ms',
    'last_response_ms',
    'time_to_first_response_ms',
    'total_response_time_ms'
  ];
}

function ensureSheetHeaders_(sheet, requiredHeaders) {
  const lastColumn = sheet.getLastColumn();
  const currentHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v || '').trim())
    : [];

  if (currentHeaders.length === 0 || currentHeaders.every(v => !v)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders;
  }

  const missing = requiredHeaders.filter(h => !currentHeaders.includes(h));
  if (missing.length) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }

  return currentHeaders.concat(missing);
}

function buildPlaceholderRecord_(studyId, workerId, groupId, now) {
  return {
    study_id: studyId,
    worker_id: workerId,
    group_id: groupId,
    created_at: now,
    updated_at: now,
    payload_json: '',
    participant_id: workerId,
    submitted_at: '',
    experience: '',
    self_report_careful: '',
    self_report_visibility: '',
    comment_difficult_images: '',
    comment_other_feedback: '',
    num_trials: ''
  };
}

function buildParticipantRecord_(payload, existing) {
  const meta = payload.meta || {};
  const comments = payload.comments || {};
  const selfReport = payload.self_report || {};
  const trials = Array.isArray(payload.trials) ? payload.trials : [];
  const now = new Date().toISOString();
  const record = {
    study_id: sanitize_(payload.study_id || 'default_study'),
    worker_id: sanitize_(meta.worker_id || meta.participant_id || ''),
    group_id: meta.group_id ?? '',
    created_at: existing && existing.createdAt ? existing.createdAt : (meta.timestamp || now),
    updated_at: now,
    payload_json: CONFIG.storeRawPayload ? JSON.stringify(payload) : '',
    participant_id: sanitize_(meta.participant_id || meta.worker_id || ''),
    submitted_at: meta.timestamp || now,
    experience: sanitize_(meta.experience || ''),
    self_report_careful: selfReport.careful ?? '',
    self_report_visibility: selfReport.visibility ?? '',
    comment_difficult_images: comments.difficult_images || '',
    comment_other_feedback: comments.other_feedback || '',
    num_trials: trials.length
  };

  trials.forEach((trial, idx) => {
    const slot = sanitize_(trial.trial_slot || `s${idx + 1}`);
    const timing = trial.timing || {};

    record[`${slot}_scene_id`] = trial.scene_id || '';
    record[`${slot}_scene_number`] = trial.scene_number ?? '';
    record[`${slot}_blur_level`] = trial.blur_level ?? '';
    record[`${slot}_blur_id`] = trial.blur_id || '';
    record[`${slot}_image_path`] = trial.image_path || '';
    record[`${slot}_q1_state`] = trial.q1_state || '';
    record[`${slot}_q2_axis`] = trial.q2_axis || '';
    record[`${slot}_q3_cues`] = Array.isArray(trial.q3_cues) ? trial.q3_cues.join('|') : (trial.q3_cues || '');
    record[`${slot}_q4_confidence`] = trial.q4_confidence ?? '';
    record[`${slot}_trial_start_ms`] = timing.trial_start_ms ?? '';
    record[`${slot}_first_response_ms`] = timing.first_response_ms ?? '';
    record[`${slot}_last_response_ms`] = timing.last_response_ms ?? '';
    record[`${slot}_time_to_first_response_ms`] = timing.time_to_first_response_ms ?? '';
    record[`${slot}_total_response_time_ms`] = timing.total_response_time_ms ?? '';
  });

  return record;
}

function upsertRecord_(sheet, rowIndex, record, baseHeaders) {
  const headers = ensureSheetHeaders_(sheet, (baseHeaders || []).concat(Object.keys(record)));
  let rowValues = headers.map(h => (record[h] !== undefined ? record[h] : ''));

  if (rowIndex > 0) {
    const currentValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    rowValues = headers.map((h, idx) => (record[h] !== undefined ? record[h] : currentValues[idx]));
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
    return rowIndex;
  }

  sheet.appendRow(rowValues);
  return sheet.getLastRow();
}

function replaceTrialRows_(payload) {
  const sheet = getTrialSheet_();
  const headers = ensureSheetHeaders_(sheet, getTrialHeaders_());
  const meta = payload.meta || {};
  const studyId = sanitize_(payload.study_id || 'default_study');
  const workerId = sanitize_(meta.worker_id || meta.participant_id || '');
  const participantId = sanitize_(meta.participant_id || workerId);
  const submittedAt = meta.timestamp || new Date().toISOString();
  const experience = sanitize_(meta.experience || '');
  const groupId = meta.group_id ?? '';

  deleteExistingParticipantRows_(sheet, studyId, workerId);

  const trials = Array.isArray(payload.trials) ? payload.trials : [];
  if (!trials.length) return;

  const rows = trials.map((trial, idx) => {
    const timing = trial.timing || {};
    const record = {
      study_id: studyId,
      worker_id: workerId,
      participant_id: participantId,
      group_id: groupId,
      experience,
      submitted_at: submittedAt,
      trial_slot: trial.trial_slot || `s${idx + 1}`,
      scene_id: trial.scene_id || '',
      scene_number: trial.scene_number ?? '',
      blur_level: trial.blur_level ?? '',
      blur_id: trial.blur_id || '',
      image_path: trial.image_path || '',
      q1_state: trial.q1_state || '',
      q2_axis: trial.q2_axis || '',
      q3_cues: Array.isArray(trial.q3_cues) ? trial.q3_cues.join('|') : (trial.q3_cues || ''),
      q4_confidence: trial.q4_confidence ?? '',
      trial_start_ms: timing.trial_start_ms ?? '',
      first_response_ms: timing.first_response_ms ?? '',
      last_response_ms: timing.last_response_ms ?? '',
      time_to_first_response_ms: timing.time_to_first_response_ms ?? '',
      total_response_time_ms: timing.total_response_time_ms ?? ''
    };

    return headers.map(h => (record[h] !== undefined ? record[h] : ''));
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function deleteExistingParticipantRows_(sheet, studyId, workerId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim() === studyId && String(values[i][1]).trim() === workerId) {
      sheet.deleteRow(i + 2);
    }
  }
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
