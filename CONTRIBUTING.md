# Contributing

Corrections and new models are welcome. The one rule: every value must trace to a vendor datasheet.

## Suggest without a pull request

Most people should start here. Open a GitHub issue and the maintainers will turn it into a data change:

- [Correct a value](https://github.com/danryan06/switch-comparison/issues/new?template=correction.yml) — wrong figure, newer datasheet, lifecycle, or clearing a Needs checking flag
- [Request an addition](https://github.com/danryan06/switch-comparison/issues/new?template=add-request.yml) — missing model, family, or vendor line

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

   When a vendor's own documents conflict: prefer the specific table over overview text; prefer two agreeing sources over one; for PoE budgets, use the lower figure. Record the other value in a note.
5. Run `npm run validate`. Fix every error. Read every warning and either fix it or explain it in the PR.
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
