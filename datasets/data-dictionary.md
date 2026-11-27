# Dataset fields

- **source_id** — original SPL record UUID on each rule. Identifier rows use stable local ingredient IDs and retain the same ID across supported aliases.
- **left_id / right_id** — unordered pair represented in lexical ID order.
- **kind / normalized** — explicit substance category and Unicode-normalized exact-match alias.
- **classification** — classification or direction preserved from the label.
- **display** — interface classification using the mapping in the provenance document.
- **description / management** — concise label paraphrases.
- **evidence / updated_on** — official label URL and effective date.
- **dataset.version** — SPL set ID paired with the pinned revision number.

Every release row is structurally checked during backend startup. Source verification checks the upstream record identity, effective date and relevant wording. Clinical review of the curated mapping is pending.
