/**
 * Google Apps Script: translate a sheet + export i18n JSON
 *
 * Sheet format (example):
 *   A: key
 *   B: he (source)
 *   C: en (target)
 *
 * 1) Open Google Sheets → Extensions → Apps Script
 * 2) Paste this file into Code.gs
 * 3) Run translateMissing() (first time → grant permissions)
 */

const CONFIG = {
  SHEET_NAME: 'Strings',
  KEY_COL: 1,
  SOURCE_COL: 2,   // Hebrew
  TARGET_COL: 3,   // English
  SOURCE_LANG: 'iw',  // 'he' also works; 'iw' is commonly accepted by Apps Script
  TARGET_LANG: 'en',
  HEADER_ROWS: 1,
};

function translateMissing() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error(`Missing sheet: ${CONFIG.SHEET_NAME}`);

  const lastRow = sh.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROWS) return;

  const numRows = lastRow - CONFIG.HEADER_ROWS;
  const keys = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.KEY_COL, numRows, 1).getValues();
  const src = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.SOURCE_COL, numRows, 1).getValues();
  const tgt = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.TARGET_COL, numRows, 1).getValues();

  const cache = PropertiesService.getScriptProperties();

  const out = tgt.map((row, i) => {
    const existing = (row[0] || '').toString().trim();
    const text = (src[i][0] || '').toString().trim();
    if (existing || !text) return [existing];

    const cacheKey = `tr:${CONFIG.SOURCE_LANG}:${CONFIG.TARGET_LANG}:${hash_(text)}`;
    const cached = cache.getProperty(cacheKey);
    if (cached) return [cached];

    // LanguageApp uses Google Translate under the hood (quota-limited).
    const translated = LanguageApp.translate(text, CONFIG.SOURCE_LANG, CONFIG.TARGET_LANG);

    cache.setProperty(cacheKey, translated);
    return [translated];
  });

  sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.TARGET_COL, numRows, 1).setValues(out);
}

/**
 * Export two JSON files (he.json / en.json) into your Google Drive root.
 * Output format:
 *   { "some_key": "Some text", ... }
 */
function exportI18nJson() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error(`Missing sheet: ${CONFIG.SHEET_NAME}`);

  const lastRow = sh.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROWS) return;

  const numRows = lastRow - CONFIG.HEADER_ROWS;

  const keys = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.KEY_COL, numRows, 1).getValues().map(r => (r[0] || '').toString().trim());
  const he = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.SOURCE_COL, numRows, 1).getValues().map(r => (r[0] || '').toString());
  const en = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.TARGET_COL, numRows, 1).getValues().map(r => (r[0] || '').toString());

  const heObj = {};
  const enObj = {};

  keys.forEach((k, i) => {
    if (!k) return;
    if (he[i]) heObj[k] = he[i];
    if (en[i]) enObj[k] = en[i];
  });

  DriveApp.createFile('he.json', JSON.stringify(heObj, null, 2), MimeType.PLAIN_TEXT);
  DriveApp.createFile('en.json', JSON.stringify(enObj, null, 2), MimeType.PLAIN_TEXT);
}

/* --- helpers --- */
function hash_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(b => (b + 256).toString(16).slice(-2)).join('');
}
