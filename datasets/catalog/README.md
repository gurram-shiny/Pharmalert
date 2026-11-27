# US product name catalogs

The medicine picker includes brands and active ingredient names from the full openFDA Drugs@FDA export. The importer selects applications with an approved original submission and excludes products marked tentative. Historical records can appear. The supplement picker indexes product names and dietary ingredient names from the NIH Office of Dietary Supplements' full Dietary Supplement Label Database CSV release, including historical labels. Listing in DSLD records what a label says. It conveys no FDA approval or interaction assessment.

Run `python datasets/catalog/build.py` to refresh both indexes without a key. For a reproducible rebuild using downloaded ZIPs, supply `--fda FILE --nih FILE` and compare their SHA-256 digests with sources.json. The name picker ships with both frontends. Selecting a name sends it to the existing interaction engine, which determines coverage separately.

Sources: [Drugs@FDA](https://open.fda.gov/apis/drug/drugsfda/download/) and [NIH Dietary Supplement Label Database](https://dsld.od.nih.gov/api-guide).
