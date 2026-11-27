"""Apply the research model to source-linked passages in the local label snapshot."""
import argparse
import hashlib
import json
import re

from review import ROOT, review


def screen(drug1, drug2):
    model = json.loads((ROOT/"model.json").read_text(encoding="utf-8"))
    records = json.loads((ROOT/"corpus.json").read_text(encoding="utf-8"))
    results = []
    for record in records:
        encoded = json.dumps(record["sections"], ensure_ascii=False, separators=(",", ":")).encode()
        if hashlib.sha256(encoded).hexdigest() != record["checksum"]:
            raise ValueError("Label section integrity check failed for " + record["id"])
        for passage in re.split(r"(?<=[.!?])\s+", record["sections"]["drug_interactions"]):
            if not all(name.casefold() in passage.casefold() for name in (drug1,drug2)):
                continue
            results.append(dict(label_id=record["id"], version=record["version"], source=record["source"],
                                passage=passage, **review(model,passage,(drug1,drug2))))
    return {"use":"research_only","labels_searched":len(records),"passages":results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("drug1")
    parser.add_argument("drug2")
    args=parser.parse_args()
    if not args.drug1.strip() or not args.drug2.strip() or args.drug1.casefold()==args.drug2.casefold():
        parser.error("Provide two distinct nonempty drug names.")
    print(json.dumps(screen(args.drug1,args.drug2),indent=2))
