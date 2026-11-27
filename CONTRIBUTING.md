# Contributing

Corrections and new models are welcome. The one rule: every value must trace to a vendor datasheet.

## Suggest without a pull request

Most people should start here. Open a GitHub issue and the maintainers will turn it into a data change:

- [Correct a value](https://github.com/danryan06/switch-comparison/issues/new?template=correction.yml): wrong figure, newer datasheet, lifecycle, or clearing a Needs checking flag
- [Request an addition](https://github.com/danryan06/switch-comparison/issues/new?template=add-request.yml): missing model, family, or vendor line

Link the vendor's own datasheet and name the table or page. You do not need to write JSON.

Prefer to edit the data yourself? Follow the steps below and open a pull request.

## Adding or correcting a model

1. Find the family file under `data/families/<vendor>/`. If the family is new, copy an existing file from the same vendor and add it to `data/index.json`. Set `"role": "aggregation"` for distribution and core fabric lines; omit it (or use `"access"`) for campus access families.
2. If the datasheet is not already in `data/sources.json`, add it with the title, URL, and the date you retrieved it.
   Cite the vendor's own English-language document hosted on the vendor's domain. Third-party-hosted or non-English documents may be used only as secondary sources, and values that appear only there must carry a `verify` flag. Mark a non-English source with `"language": "ja"` (or the relevant code); the validator warns about it.
3. Enter values exactly as the datasheet states them. Do not round, convert, or fill a gap from memory.
   A PoE budget is the power the supplies make available, so enter the vendor's figure even when it exceeds the port count times the per-port maximum. The sizer caps it at what the ports can draw and shows both numbers.
4. If two places in the datasheet disagree, or you had to derive a value, flag it:
   - On a PoE budget: add `"verify": true`.
   - On a model: add the field name to `verify` and explain in `verifyNote`.
   - On a whole family, where the value legitimately differs model to model: add the field name to the family's `verify` and explain in the family's `verifyNote`.
   - If the flag describes something the schema cannot represent (not missing or conflicting data), also add `"modelingLimitation": true` next to `verifyNote`. It then shows under Known modeling limitations instead of the open Needs checking items.

   When a vendor's own documents conflict: prefer the specific table over overview text; prefer two agreeing sources over one; for PoE budgets, use the lower figure. Record the other value in a note.
5. Run `npm run validate` and `npm test`. Fix every error and failing test. Read every warning and either fix it or explain it in the PR.
   If you changed data, set `updated` in `data/index.json` to today's date; the validator warns when it is older than the newest source `retrieved` date.
6. In the PR description, cite the datasheet page or table for each value you changed.

## Clearing a verification flag

Open a PR that removes the flag and cites the source that settles it: a newer datasheet revision, a vendor ordering guide, a hardware installation guide, or a vendor TAC or SE confirmation in writing.

Configurators and distributor tools (for example Intangi) may corroborate a value and clear its flag, but the citation stays on the vendor document.

Where a second vendor document supplies values the primary datasheet does not, list it in the family's `additionalSources` so it is credited alongside the primary source.

## Vendor audits

When a vendor publishes a new datasheet revision:

1. Update the entry in `sources.json` with the new title and retrieval date.
2. Walk every model in the affected families against the new tables. PoE budgets, port counts, and uplink options change most often.
3. Add new SKUs. End-of-sale models stay in the dataset as a reference, with a `lifecycle` block citing the vendor's EOL notice. The sizer hides them by default. Add `replacement` only when the vendor names one.
4. Note the revision in the PR title, for example `Fortinet: audit against Secure Campus R17`.
5. When a vendor announces end of sale, add the lifecycle block in its own PR with the announcement link.

## What is out of scope for now

Models that have dropped off the vendor's current datasheet. High-speed fabric and aggregation models are welcome when they use `fabricPorts` (see the Catalyst 9500 examples).

## Accessory images

`data/accessory-images.json` lists every accessory SKU exactly once: in `images` with a file and its source, or in `missing` with what was checked. Its fields are described in `data/accessory-images.schema.json`, and `npm run validate` checks it.

The sourcing rule is strict:

- **Vendor sources only.** Use the vendor's own product page, datasheet, ordering guide, install guide or optics matrix, on the vendor's domain (official docs and CDN subdomains count). Never use distributors, resellers, marketplaces, compatible-optics sellers or image search results.
- **No look-alikes.** If there is no vendor image for a part, leave it in `missing` with what you checked. Never use another vendor's photo, and never draw or generate one.
- **Shared images.** Reuse one image across SKUs only when the vendor presents it for those SKUs, for example every length of a DAC. Add a `caption_note` saying what the image shows, such as "Photo shows the 1 m length". Store the file once and point each entry at it.
- **Check the image.** Open it and confirm it shows the right part and form factor, not a logo, banner or different module.

File layout and format:

- Path: `src/assets/images/accessories/<vendor-slug>/<file>.jpg`, where `<vendor-slug>` matches the catalog file name. Name the file after the SKU it shows, lowercased, with anything that is not a letter or digit turned into a hyphen (`SFP-10G-SR` becomes `sfp-10g-sr.jpg`). When the source does not say which part an image shows, name it after the vendor's caption or section instead.
- Photos: JPEG, longest edge about 1200 px (smaller if the source is smaller; never upscale), quality around 85, cropped to the product with a little margin. Keep PNG only when the vendor's file is a transparent PNG.
- Line drawings: PNG, same size rule, with `"image_type": "drawing"`.
- Aim for under 150 KB per image. The validator rejects files over 300 KB.
- In `source_page_url`, link the vendor page or document, and say in `source_detail` which figure, page or section the image comes from.

