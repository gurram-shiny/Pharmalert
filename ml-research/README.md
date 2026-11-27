# Local drug-interaction text extraction

A binary linear support-vector machine scores whether a supplied English passage describes an interaction between two named drug mentions. Training uses positive and negative pair annotations from the authors' DDIExtraction 2013 XML distribution. Candidate drug mentions must already be identified. The model has no endpoint in the patient app. Scores are decision margins. They do not measure medical risk or clinical probability.

## Run offline

From the project root, run the following to screen the included 39 single-ingredient label records for source-linked passages containing two names. Python's standard library is sufficient for inference. An empty list means the search found no eligible passage. Data collection and training require internet access unless the training archive is supplied locally. No API keys are used.

```powershell
python ml-research/screen_labels.py simvastatin gemfibrozil
python ml-research/review.py "The supplied passage goes here." simvastatin gemfibrozil
```

## Reproduce the model

Install the dependencies in an isolated Python 3.13 environment and run the trainer. It downloads the authors' archive at a fixed commit and verifies SHA-256 before parsing XML. Use `--archive PATH` for a local copy. Run `node ml-research/collect.mjs` separately to verify and rebuild the label snapshot from its pinned source IDs. These 39 labels are inference material and have no human-annotated evaluation outcomes in this project.

```powershell
python -m pip install -r ml-research/requirements.txt
python ml-research/train.py
```

Training uses word and word-pair features before, between and after the indicated mentions, plus distance and boundary features. The official extraction test documents were held out. Validation documents were assigned by a deterministic hash of the official training paths. Repeated sentences across partitions were removed from the lower-priority partition. Discontinuous, overlapping or mismatched spans were excluded. Different partitions can mention the same drug. See evaluation.json for exclusions, counts and source-specific metrics.

The predefined validation target was 90% precision with at least 30 true positives. It was missed. The exploratory threshold instead maximizes validation F0.5 with the same support floor. Held-out precision was 72.1%, recall 63.9%, and F1 67.8%. MedLine recall was 31.5%. The model can miss interactions and misread negation, complex references or lists. It has no validated capability to predict effects for previously unseen drug pairs, dose, severity, safety, or patient outcomes.

The corpus combines DrugBank texts and MedLine abstracts. The benchmark is historical. Prospective performance on current prescribing labels, reviewer sign-off, and rights for commercial deployment remain unverified. Neither a positive nor a negative model result changes the verified interaction dataset.

Sources: [original corpus](https://github.com/isegura/DDICorpus), [benchmark publication](https://aclanthology.org/S13-2056/), [openFDA label dataset](https://open.fda.gov/apis/drug/label/).
