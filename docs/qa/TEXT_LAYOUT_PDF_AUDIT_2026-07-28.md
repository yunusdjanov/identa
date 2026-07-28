# Text, layout, and PDF audit

- Date: 2026-07-28
- Branch: `audit/text-layout-pdf`
- Routed pages inventoried: 29
- Locales: Russian, Uzbek, English

## Result

Status: CODE-READY / INTERACTIVE VIEWPORT MATRIX BLOCKED

Static review, automated regression coverage, production build, and rendered
PDF inspection are complete. Interactive browser coverage is not marked as
passed because the browser-control connection rejected the session metadata
before a page could be opened.

## Coverage

| Area | Status | Evidence |
| --- | --- | --- |
| Dictionary parity/placeholders | PASS | All locales have identical keys and placeholders; empty, duplicate, backtick, okina, and mojibake guards pass. |
| Runtime copy | PASS | Hardcoded one-language dashboard fallbacks and untranslated accessibility labels were removed or localized. |
| Shared responsive layout | PASS (static) | Long headings, chart actions, billing export header, and admin pagination now stack or wrap at narrow widths. |
| Global error localization | PASS | Error document language and visible copy use the same cookie-resolved locale. |
| Reduced motion | PASS (static) | Global reduced-motion policy covers animation, transitions, and smooth scrolling. |
| Table PDF | PASS | Rendered an 84-row, five-column A4 landscape fixture; repeated headers and intact rows were visually inspected. |
| Patient PDF | PASS | Rendered a 42-row, six-column A4 landscape fixture with long name/address/work text; no clipping or split rows found. |
| Browser viewport/zoom matrix | BLOCKED | Browser connector error: `codex/sandbox-state-meta: missing field sandboxPolicy`. |

## Fixed findings

- PDF documents now declare their locale in `<html lang>`.
- Long PDF cells, patient names, addresses, and info values wrap safely.
- Table headings repeat and rows/summary cards avoid page splits.
- Long reports no longer create a footer-only blank final page.
- Patient finance export labels both phone numbers and address.
- Treatment-history exports label entry count correctly and use landscape when
  financial columns are present.
- Export success text now describes the actual print/save flow instead of
  claiming a file was already downloaded.
- PDF-only em dash and middle-dot separators were replaced with ASCII-safe
  output.
- Narrow chart, billing, and admin pagination headers now reflow instead of
  squeezing localized text.
- Landing and treatment-entry accessibility labels now follow the active
  locale.

## Verification

```text
npm.cmd test
72 files passed; 416 tests passed

npm.cmd exec tsc -- --noEmit
passed

npm.cmd run lint
passed

npm.cmd run build
passed; 56 static pages generated
```

Temporary PDF fixtures and rendered PNG pages were removed after inspection.
