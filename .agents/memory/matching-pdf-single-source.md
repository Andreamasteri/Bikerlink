# Matching PDF: single source and hard build gate

## Rule

- `docs/matching-system.md` is the editable source.
- `scripts/generate-matching-pdf.mjs` produces the deploy asset at
  `server/public/matching-system.pdf`.
- Both `/matching-system.pdf` and `/api/exports/matching-system.pdf` are
  registered together in `server/routes/matching-pdf.ts` and serve that exact
  asset.
- The matching endpoint must never fall back to the competitor-analysis PDF.
- PDF generation belongs to the build/post-merge pipeline, not to an HTTP
  request.

## Failure behavior

The build must fail if generation fails, the output is empty, or the output
does not start with the `%PDF-` signature. At runtime, a missing canonical
asset returns `404`; there is no dynamic generator fallback.

## Verification

Run the focused route test and server typecheck:

```bash
npx vitest run server/__tests__/matching-pdf-route.test.ts
npx tsc --noEmit -p server/tsconfig.json
```

For pipeline verification, run the generator and verify both the generated
document and public copy begin with `%PDF-`.
