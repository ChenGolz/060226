# Translation helpers (Google Apps Script)

If you keep your strings in Google Sheets, you can auto-translate missing cells (Google Translate)
and export `he.json` / `en.json`.

1. In Google Sheets: **Extensions → Apps Script**
2. Paste `translate.gs` into `Code.gs`
3. Create a sheet named `Strings` with columns:
   - **A:** key (e.g. `recommended-brands_h1`)
   - **B:** Hebrew (source)
   - **C:** English (target)
4. Run `translateMissing()` (first run will ask for permissions)
5. Run `exportI18nJson()` to create JSON files in Drive

Notes:
- `LanguageApp.translate` is quota-limited. For large volumes, use Cloud Translation API instead.
