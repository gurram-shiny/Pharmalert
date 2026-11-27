"""Train against the authors' pinned DDIExtraction 2013 XML distribution."""
import argparse
import hashlib
import io
import json
import math
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import sklearn
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import average_precision_score, confusion_matrix, precision_recall_curve
from sklearn.preprocessing import normalize
from sklearn.svm import LinearSVC

from review import ROOT, features

URL = "https://raw.githubusercontent.com/isegura/DDICorpus/819b0fa538ed83ab2a8b4f5417bba3c03249b7f3/DDICorpus-2013.zip"
SHA = "87fc63e32ebce20d9841c372e0c594ec72d60882ab5621550ca73c3eaf80ab60"


def load(raw):
    if hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError("Corpus checksum mismatch")
    splits = {"train": [], "validation": [], "test": []}
    excluded = Counter()
    with zipfile.ZipFile(io.BytesIO(raw)) as corpus:
        for path in sorted(corpus.namelist()):
            if not path.endswith(".xml") or not path.startswith("DDICorpus/"):
                continue
            if "/Train/" in path:
                split = "validation" if int(hashlib.sha256(path.encode()).hexdigest(), 16) % 5 == 0 else "train"
            elif "/Test for DDI Extraction task/" in path:
                split = "test"
            else:
                continue
            doc = ET.fromstring(corpus.read(path))
            for sentence in doc.iter("sentence"):
                text = sentence.attrib["text"]
                entities = {e.attrib["id"]: e for e in sentence.findall("entity")}
                for pair in sentence.findall("pair"):
                    spans = []
                    for key in ("e1", "e2"):
                        entity = entities[pair.attrib[key]].attrib
                        match = re.fullmatch(r"(\d+)-(\d+)", entity["charOffset"])
                        if match:
                            a, b = map(int, match.groups())
                            if text[a:b+1] == entity["text"]:
                                spans.append((a, b+1))
                    if len(spans) < 2 or sorted(spans)[0][1] > sorted(spans)[1][0]:
                        excluded[split + "_unsupported_spans"] += 1
                        continue
                    label = {"true": 1, "false": 0}[pair.attrib["ddi"]]
                    splits[split].append((text, spans, label, path))
    # Remove repeated sentences from lower-priority partitions before fitting.
    seen = set()
    for split in ("test", "validation", "train"):
        rows = splits[split]
        fresh = [r for r in rows if " ".join(r[0].lower().split()) not in seen]
        excluded[split+"_sentence_overlap"] = len(rows)-len(fresh)
        splits[split] = fresh
        seen.update(" ".join(r[0].lower().split()) for r in fresh)
    return splits, excluded


def metrics(labels, scores, threshold):
    tn, fp, fn, tp = confusion_matrix(labels, scores >= threshold, labels=[0, 1]).ravel().tolist()
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=tp/max(tp+fp,1), recall=tp/max(tp+fn,1),
                f1=2*tp/max(2*tp+fp+fn,1), average_precision=float(average_precision_score(labels,scores)),
                positive_prevalence=float(np.mean(labels)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    raw = args.archive.read_bytes() if args.archive else urllib.request.urlopen(URL,timeout=90).read()
    splits, excluded = load(raw)
    vec = DictVectorizer()
    def rows(split):
        return (features(text, spans) for text, spans, _, _ in splits[split])
    y = {s:np.array([row[2] for row in data]) for s,data in splits.items()}
    matrix = normalize(vec.fit_transform(rows("train")))
    if max(matrix.shape + (matrix.nnz,)) >= 2**31:
        raise ValueError("Training matrix exceeds the supported solver size")
    matrix.indices = matrix.indices.astype(np.int32)
    matrix.indptr = matrix.indptr.astype(np.int32)
    model = LinearSVC(C=0.1,class_weight=None,random_state=23,max_iter=5000).fit(matrix,y["train"])
    valid = model.decision_function(normalize(vec.transform(rows("validation"))))
    p,r,thresholds = precision_recall_curve(y["validation"],valid)
    eligible = np.where((p[:-1]>=0.95)&(r[:-1]*y["validation"].sum()>=30))[0]
    # Exploratory fallback is explicitly identified in the saved model and report.
    supported = np.where(r[:-1]*y["validation"].sum() >= 30)[0]
    f_half = 1.25*p[:-1]*r[:-1]/np.maximum(0.25*p[:-1]+r[:-1],1e-12)
    index = eligible[0] if len(eligible) else supported[np.argmax(f_half[supported])]
    threshold=float(thresholds[index])
    scores=model.decision_function(normalize(vec.transform(rows("test"))))
    report=dict(validation_precision_gate_met=bool(len(eligible)),source=URL,sha256=SHA,sklearn=sklearn.__version__,excluded=dict(excluded),
                pairs={s:len(data) for s,data in splits.items()},
                documents={s:len({row[3] for row in data}) for s,data in splits.items()},
                validation=metrics(y["validation"],valid,threshold),test=metrics(y["test"],scores,threshold),
                threshold=threshold)
    for domain in ("DrugBank","MedLine"):
        mask=np.array(["/"+domain+"/" in row[3] for row in splits["test"]])
        report[domain]=metrics(y["test"][mask],scores[mask],threshold)
    artifact=dict(validation_precision_gate_met=bool(len(eligible)),threshold=threshold,intercept=float(model.intercept_[0]),
                  weights=dict(zip(vec.get_feature_names_out(),model.coef_[0])))
    restored = json.loads(json.dumps(artifact))
    margins = [restored["intercept"] + sum(restored["weights"][key] for key in sorted(row) if key in restored["weights"]) / (math.sqrt(sum(1 for key in row if key in restored["weights"])) or 1.0)
               for row in rows("test")]
    np.testing.assert_allclose(margins, scores, atol=1e-9)
    report["export_parity_cases"] = len(margins)
    (ROOT/"model.json").write_text(json.dumps(artifact,separators=(",",":")),encoding="utf-8")
    (ROOT/"evaluation.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))


if __name__ == "__main__":
    main()
