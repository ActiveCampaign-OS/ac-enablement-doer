# 2026 presentation template asset policy

The supplied `ActiveCampaign 2026 Template (5) (1).pptx` is the visual reference for the
Enablement Do-er PowerPoint renderer. It contains branded layouts, logos, spot illustrations,
product illustrations, integration icons, and third-party marks.

## What the app uses now

The production renderer uses only the documented visual system: 16:9 layout, Arimo headlines,
IBM Plex Sans body copy, Midnight (`#00002D`), Dusk (`#003343`), AC Blue (`#0022D2`), Cream
(`#FBF9F3`), White, and AC Light Blue (`#F3FAFF`). It creates editable shapes and text directly
in the app-generated `.pptx`; no template media is bundled into the repository or uploaded by the
app.

## Asset inventory

`ac-2026-template-asset-inventory.json` records every media asset referenced by the source deck,
the source slide(s), dimensions where readable, SHA-256, and category. Rebuild it from a newly
approved template with:

```bash
node scripts/inventory-pptx-template.mjs \
  "/path/to/ActiveCampaign 2026 Template.pptx" \
  --output docs/ac-2026-template-asset-inventory.json
```

The manifest is an index, not an assertion of ownership or permission. Every asset starts as
`REFERENCE_ONLY_PENDING_BRAND_REVIEW`; in particular, partner logos, integration icons, stock
photos, and illustrations must not be embedded by the agent until a Brand/Design owner confirms
the allowed use and provides an approved distribution source.

## Promotion path

Once approved, store a curated, versioned asset pack in a private app-controlled location, record
its source, owner, approved uses, and hash, and allow the renderer to select only those approved
entries. Do not commit the full template or a bulk media extraction to the app repository.
