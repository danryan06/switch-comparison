# Switch Comparison

A vendor-neutral site for comparing campus and aggregation Ethernet switches. Every number comes from the vendor's own datasheet. Browse the full catalog, put models side by side, and optionally size a wiring closet against PoE and port demand.

Live site: [danryan06.github.io/switch-comparison](https://danryan06.github.io/switch-comparison/)

Current coverage: **56 families, 337 models** (25 past end of sale) across Cisco Catalyst (9200 through 9500, including C9350), Cisco Meraki MS (including MS130R and MS450), HPE Aruba CX (6000 through 8360, plus 4100i), Extreme Networks (5320 through 5720), Juniper EX, Ubiquiti UniFi, and Fortinet FortiSwitch (including Rugged). That spans copper and fiber access, high-speed fabric ports on aggregation SKUs, and compact, desktop, and rugged form factors.

## What it does

- **Browse.** Filter and sort every model by vendor, ports, PoE, lifecycle, environment, and more. Show or hide columns, sort any visible column, and tick up to four rows to compare.
- **Compare.** Up to four models side by side, with differing cells highlighted. Faceplates show access, fabric, and modular uplink layouts.
- **Size a closet.** Optional helper: describe endpoints (APs, phones, cameras) plus copper, fiber, and uplink needs. Models that fit are sized with the fewest switches and the smallest PSU configuration; models that do not list why. Pure-fabric aggregation SKUs stay in Browse and Compare but drop out of the sizer.

A **Needs checking** page (footer link) collects values that disagree inside a datasheet or had to be derived, until someone confirms them.

## Repository layout

```
data/
  index.json                 list of family files to load, plus the data date
  sources.json               vendor datasheets, keyed by id
  uplinks.json               fixed uplink sets and network module options
  schema.json                JSON Schema for a family file
  families/<vendor>/<id>.json  one file per product family
src/index.html               the app, with a placeholder where data is inlined
scripts/
  validate.mjs               checks the data (runs in CI on every PR)
  build.mjs                  validates, then writes dist/index.html and dist/data/
.github/workflows/pages.yml  validate on PRs, build and deploy to GitHub Pages on main
```

The built site is a single self-contained HTML file. The raw data is also published at `/data/`, including `/data/all.json`, so others can consume it.

## Building locally

Requires Node 18 or newer. There are no dependencies to install. Useful when editing data or the UI:

```
npm run validate   # check the data
npm run build      # write dist/
npm run preview    # build and serve dist/ on http://localhost:8080
```

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md). Corrections and new models are welcome; every value must trace to a vendor datasheet.

## How the data is modeled

A few decisions matter more than the rest, because they are where vendors describe the same thing differently.

**PoE budget belongs to a power supply configuration, not a model.** A Catalyst 9300-48UXM delivers anywhere from 490W to 2,880W depending on which supplies are installed. Each model lists every configuration its datasheet gives, and the sizer picks the smallest one that covers the load.

**Ports are grouped by capability.** Access ports (`accessPorts`) are groups of identical ports at or below 25G, each with a speed and a per-port PoE maximum. That handles mixed models like the C9300-48UXM (12x 10G plus 36x 2.5G) and partial-PoE models like the FS-148F-POE. Ports at 40G and above sit in `fabricPorts` (for example C9500-32C with 32x 100G). Integrated high-speed ports use `fabricPorts` with no `uplinks` key; optional network modules use `uplinks` instead (for example C9500-16X). The closet sizer only counts `accessPorts`.

**Copper and fiber ports are kept apart.** Each access port group has a `media` of `rj45` (the default) or `sfp`. Powered devices and data ports can only land on copper; fiber demand can only land on SFP access ports. Fabric ports use `sfp`, `qsfp` (default), or `qsfp-dd` and never carry PoE.

**Form factor matters for small sites.** Models are `1RU` (the default), `Compact`, or `Desktop`, with a `fanless` flag. Switches that can run on PoE from upstream (Catalyst 9200CX-12T and -8PT, FS-108F) describe it in `poweredBy`.

**Stacking is not one thing.** Cisco StackWise stacks over dedicated rear ports. Aruba VSF stacks over the front uplinks, so the sizer subtracts those ports from available uplinks. Fortinet has no hardware stack; a FortiGate manages switches as a fabric over FortiLink, so `maxMembers` is `null`. Two-node HA pairs such as StackWise Virtual and VSX use `maxMembers: 2` with `frontPanel: false`. Switches that cannot stack at all, like the Catalyst 9200CX, use `maxMembers: 1`.

**Model values can override the family.** When one model differs from its family (a different datasheet, route scale, MAC table, or buffer), set that field on the model.

**Route scale is stored as stated.** Cisco, HPE, and Fortinet each count routes differently. The text is kept verbatim rather than converted to a number that would imply they are comparable.

**Routing tiers.** Every family is `l2` (no routing on the switch), `ospf` (routed access, no BGP), or `full` (BGP available). Licensing needed to unlock routing is described in the family's `licensing` field.

**End-of-sale models stay, but stay out of the way.** A `lifecycle` block records `status` (`current`, `endOfSale`, or `endOfSupport`), the end-of-sale and end-of-support dates, a link to the vendor's EOL notice, and any `replacement` the vendor names. No block means current. The sizer hides anything past end of sale unless you tick "Include end-of-sale models", Browse defaults to current only, and replacements are shown as links to the successor model or family.

**Rugged deployments are described, not inferred.** `ruggedized` marks a model built for harsh environments, with `operatingTempC`, `ipRating`, and `mounting` (`rack`, `desktop`, `wall`, `din`) giving the specifics. Like the other fields, a family value is the default and a model can override it. Browse and the sizer can filter to rugged models only.

## Verification flags

Some values disagree between two places in the same datasheet, or had to be derived. These carry `verify: true` on a PoE budget, or a `verify` list plus a `verifyNote` on a model or family, and they show as **check** in Browse and are listed on the Needs checking page until someone confirms them. See CONTRIBUTING.md for the review workflow.

The validator also warns when a PoE budget exceeds what the ports could physically draw (port count times per-port maximum). Several Catalyst 9200 24-port models currently trip this: Cisco lists 740W with two supplies, while its own footnote says 24-port models are capped at 720W. Family-max-only switching or forwarding figures on aggregation lines are often left `null` and flagged the same way.

## License

MIT. See LICENSE.
