"""Build client search indexes from the full US product catalogs. Python standard library only."""
import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NIH = "https://api.ods.od.nih.gov/dsld/s3/data/DSLD-full-database-CSV.zip"
FDA = "https://download.open.fda.gov/drug/drugsfda/drug-drugsfda-0001-of-0001.json.zip"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fda", type=Path)
    parser.add_argument("--nih", type=Path)
    args = parser.parse_args()
    drugs, supplements, ids = {}, {}, set()

    flags = {"medicine":{}, "supplement":{}}
    def mark(kind, name, flag):
        key=" ".join((name or "").lower().split())
        flags[kind][key] = flags[kind].get(key,0) | flag

    def add(index, value):
        name = " ".join((value or "").split())
        if name and name.casefold() not in {"n/a", "unknown", "not specified"}:
            index.setdefault(name.lower(), name)

    with tempfile.TemporaryDirectory() as tmp:
        def archive(path, url, filename):
            if not path:
                path = Path(tmp)/filename
                urllib.request.urlretrieve(url, path)
            return zipfile.ZipFile(path), hashlib.sha256(path.read_bytes()).hexdigest()

        fda, drug_digest = archive(args.fda, FDA, "drug.zip")
        with fda:
            payload = json.load(fda.open(next(n for n in fda.namelist() if n.endswith(".json"))))
        products = 0
        for app in payload["results"]:
            if not any(s.get("submission_type")=="ORIG" and s.get("submission_status")=="AP" for s in app.get("submissions", [])):
                continue
            for product in app.get("products", []):
                if "tentative" in product.get("marketing_status","").lower():
                    continue
                status=product.get("marketing_status","").lower()
                flag=1 if "discontinued" in status else 2 if status in {"prescription","over-the-counter"} else 4
                mark("medicine",product.get("brand_name"),flag)
                add(drugs, product.get("brand_name"))
                for ingredient in product.get("active_ingredients", []):
                    add(drugs, ingredient.get("name"))
                products += 1
        nih, supplement_digest = archive(args.nih, NIH, "supplement.zip")
        with nih:
            for filename in nih.namelist():
                if not re.search(r"/(ProductOverview|DietarySupplementFacts)_\d+\.csv$",filename):
                    continue
                with io.TextIOWrapper(nih.open(filename), encoding="utf-8-sig",newline="") as stream:
                    for row in csv.DictReader(stream):
                        if "Ingredient" in row:
                            add(supplements, row["Ingredient"])
                        else:
                            status=row["Market Status"].strip().lower()
                            mark("supplement",row["Product Name"],1 if status=="off market" else 2 if status=="on market" else 4)
                            ids.add(row["DSLD ID"])
                            add(supplements, row["Product Name"])
        if not drugs or not ids or not supplements:
            raise ValueError("An upstream catalog is empty")
        names = {kind:"\n".join(names[k] for k in sorted(names)) for kind,names in
                 (("medicine",drugs),("supplement",supplements))}
        names["status"]={kind:"".join(str(flags[kind].get(k,0)) for k in sorted(index))
                         for kind,index in (("medicine",drugs),("supplement",supplements))}
        manifest = dict(built=datetime.now(timezone.utc).isoformat(),
                        medicine=dict(source=FDA,sha256=drug_digest,release=payload["meta"]["last_updated"],products=products,names=len(drugs)),
                        supplement=dict(source=NIH,sha256=supplement_digest,labels=len(ids),names=len(supplements)))
        for filename, data in [("names.json",names),("sources.json",manifest)]:
            pending=ROOT/(filename+".tmp")
            pending.write_text(json.dumps(data,ensure_ascii=False),encoding="utf8")
            pending.replace(ROOT/filename)
        print(json.dumps(manifest,indent=2))

if __name__ == "__main__":
    main()
