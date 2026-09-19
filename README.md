# Switch Comparison

A vendor-neutral comparison and closet sizing tool for campus access switches. Describe what a wiring closet needs to power and connect, and it tells you which models from each vendor can do it, how many switches you need, and which power supply configuration gets you there.

Current coverage: Cisco Catalyst 9200, 9200L, 9200CX, 9300, 9300X, 9300L, and 9300LM, and C9350 Smart Switches; HPE Aruba CX 6000, 6100, 6200, 6300, and 6300L; Juniper EX4000, EX4100, EX4100-F, and EX4400; Ubiquiti UniFi Enterprise Campus, Enterprise Campus S, and Pro Max; and Fortinet FortiSwitch 100 through 400 series. That includes rack-mount, compact, and desktop switches, with copper and fiber access ports. 207 models in total.

## What it does

- **Size a closet.** Enter device groups (APs, phones, cameras) with PoE class and port speed, plus copper data ports, SFP fiber access ports, uplinks, routing needs, and form factor. Every model that fits is sized with the fewest switches and the smallest PSU configuration, and every model that doesn't is listed with the reason.
- **Browse.** Filter and sort every model by vendor, family, PoE per port, and access port speed.
- **Compare.** Up to four models side by side, with differences highlighted.

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

## Running it

Requires Node 18 or newer. There are no dependencies to install.

```
npm run validate   # check the data
npm run build      # write dist/
npm run preview    # build and serve dist/ on http://localhost:8080
```

## How the data is modeled

A few decisions matter more than the rest, because they are where vendors describe the same thing differently.

**PoE budget belongs to a power supply configuration, not a model.** A Catalyst 9300-48UXM delivers anywhere from 490W to 2,880W depending on which supplies are installed. Each model lists every configuration its datasheet gives, and the sizer picks the smallest one that covers the load.

**Ports are grouped by capability.** Each model lists groups of identical access ports with a speed and a per-port PoE maximum. That handles mixed models like the C9300-48UXM (12x 10G plus 36x 2.5G) and partial-PoE models like the FS-148F-POE (PoE on 24 of 48 ports).

**Copper and fiber ports are kept apart.** Each port group has a `media` of `rj45` (the default) or `sfp`. Powered devices and data ports can only land on copper; fiber demand can only land on SFP ports.

**Form factor matters for small sites.** Models are `1RU` (the default), `Compact`, or `Desktop`, with a `fanless` flag. Switches that can run on PoE from upstream (Catalyst 9200CX-12T and -8PT, FS-108F) describe it in `poweredBy`.

**Stacking is not one thing.** Cisco stacks over dedicated rear ports. Aruba VSF stacks over the front uplinks, so the sizer subtracts those ports from available uplinks. Fortinet has no hardware stack; a FortiGate manages switches as a fabric over FortiLink, so `maxMembers` is `null`. Switches that cannot stack at all, like the Catalyst 9200CX, use `maxMembers: 1`.

**Model values can override the family.** When one model differs from its family (a different datasheet, route scale, MAC table, or buffer), set that field on the model.

**Route scale is stored as stated.** Cisco, HPE, and Fortinet each count routes differently. The text is kept verbatim rather than converted to a number that would imply they are comparable.

**Routing tiers.** Every family is `l2` (no routing on the switch), `ospf` (routed access, no BGP), or `full` (BGP available). Licensing needed to unlock routing is described in the family's `licensing` field.

## Verification flags

Some values disagree between two places in the same datasheet, or had to be derived. These carry `verify: true` on a PoE budget, or a `verify` list plus a `verifyNote` on a model or family, and they show as **check** in Browse and are listed on the Needs checking page (linked from the footer) until someone confirms them. See CONTRIBUTING.md for the review workflow.

The validator also warns when a PoE budget exceeds what the ports could physically draw (port count times per-port maximum). Several Catalyst 9200 24-port models currently trip this: Cisco lists 740W with two supplies, while its own footnote says 24-port models are capped at 720W.

## License

MIT. See LICENSE.
