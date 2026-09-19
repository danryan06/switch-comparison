# Contributing

Corrections and new models are welcome. The one rule: every value must trace to a vendor datasheet.

## Adding or correcting a model

1. Find the family file under `data/families/<vendor>/`. If the family is new, copy an existing file from the same vendor and add it to `data/index.json`.
2. If the datasheet is not already in `data/sources.json`, add it with the title, URL, and the date you retrieved it.
   Cite the vendor's own English-language document hosted on the vendor's domain. Third-party-hosted or non-English documents may be used only as secondary sources, and values that appear only there must carry a `verify` flag. Mark a non-English source with `"language": "ja"` (or the relevant code); the validator warns about it.
3. Enter values exactly as the datasheet states them. Do not round, convert, or fill a gap from memory.
4. If two places in the datasheet disagree, or you had to derive a value, flag it:
   - On a PoE budget: add `"verify": true`.
   - On a model: add the field name to `verify` and explain in `verifyNote`.
5. Run `npm run validate`. Fix every error. Read every warning and either fix it or explain it in the PR.
6. In the PR description, cite the datasheet page or table for each value you changed.

## Clearing a verification flag

Open a PR that removes the flag and cites the source that settles it: a newer datasheet revision, a vendor ordering guide, a hardware installation guide, or a vendor TAC or SE confirmation in writing.

## Vendor audits

When a vendor publishes a new datasheet revision:

1. Update the entry in `sources.json` with the new title and retrieval date.
2. Walk every model in the affected families against the new tables. PoE budgets, port counts, and uplink options change most often.
3. Add new SKUs. Leave end-of-sale models in place until the vendor removes them from the current datasheet, then remove them in their own PR.
4. Note the revision in the PR title, for example `Fortinet: audit against Secure Campus R17`.

## What is out of scope for now

Data center and aggregation-only switches, and models that have dropped off the vendor's current datasheet.
