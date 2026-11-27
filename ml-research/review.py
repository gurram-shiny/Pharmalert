"""Offline pair-specific text features and evidence-review CLI."""
import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NEGATIONS = {"no", "not", "without", "neither", "nor", "lack", "lacks", "lacked", "unlikely", "none", "never", "absent"}


def tokens(text):
    return re.findall(r"[a-z]+|[,;:()]", text.lower())


def features(text, spans):
    (a, b), (c, d) = sorted(spans)
    if not 0 <= a < b <= c < d <= len(text):
        raise ValueError("Expected two distinct, nonoverlapping mentions.")
    before, between, after = tokens(text[:a]), tokens(text[b:c]), tokens(text[d:])
    fields = {"before": before[-8:], "between": between, "after": after[:8],
              "context": before + ["target"] + between + ["target"] + after}
    keys = {"gap=" + str(min(len(between), 20)), "first=" + " ".join(between[:2]),
            "last=" + " ".join(between[-2:]),
            "first1=" + (between[0] if between else ""),
            "last1=" + (between[-1] if between else ""),
            "b1=" + (before[-1] if before else ""),
            "a1=" + (after[0] if after else ""),
            "same=" + str(text[a:b].casefold() == text[c:d].casefold()),
            "neg_before=" + str(any(w in NEGATIONS for w in before[-6:])),
            "neg_between=" + str(any(w in NEGATIONS for w in between)),
            "comma_between=" + str("," in between),
            "coord_between=" + str(any(w in {",", ";", "and", "or"} for w in between) and len(between) <= 4)}
    for region, words in fields.items():
        max_n = 3 if region in ("between", "context") else 2
        for n in range(1, max_n + 1):
            keys.update(region + "=" + " ".join(words[i:i+n]) for i in range(len(words)-n+1))
    return dict.fromkeys(keys, 1)


def mention(text, name):
    if not name.strip():
        raise ValueError("Provide a nonempty drug name.")
    hits = list(re.finditer(r"(?<!\w)" + re.escape(name) + r"(?!\w)", text, re.I))
    if len(hits) != 1:
        raise ValueError("Each named drug must occur exactly once in the passage.")
    return hits[0].span()


def review(model, text, names):
    try:
        row = features(text, [mention(text, name) for name in names])
    except ValueError as exc:
        return {"status": "abstained", "reason": str(exc)}
    known = [key for key in row if key in model["weights"]]
    norm = math.sqrt(len(known)) or 1.0
    score = model["intercept"] + sum(model["weights"][key] for key in sorted(known)) / norm
    return {"status": "research_candidate" if score >= model["threshold"] else "below_review_threshold",
            "decision_margin": round(score, 4)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Screen a supplied passage for manual evidence review.")
    parser.add_argument("text")
    parser.add_argument("drug1")
    parser.add_argument("drug2")
    args = parser.parse_args()
    model = json.loads((ROOT / "model.json").read_text())
    print(json.dumps(review(model, args.text, (args.drug1, args.drug2)), indent=2))
