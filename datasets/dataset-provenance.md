# Dataset provenance

The initial reference set is a curated subset of section 7 of the US ZOCOR label, SPL set 8f55d5de-5a4f-4a39-8c84-c53976dd6af9, version 11, effective 2025-03-28. The openFDA endpoint was inspected on 2026-11-26 without an API key. openFDA identifies SPL data as public domain and CC0. The release covers only explicitly curated pairs. It cannot establish safety and has pending pharmacist and prospective validation.

The source was retrieved as an openFDA label JSON API response. The observed SHA-256 was `bdc0bf8338cb2cab66ebcc75dc7be6a44084f5e96a9dde99e2c9cdacb448a8da`. The authored release contains four records. All four passed structural validation. Uncurated label sections were outside its scope.

DDInter 2.0 is CC BY-NC-SA 4.0. Zero DDInter rows were imported. The FDA CYP and transporter tables are supporting references and are excluded from pair matching.

- [openFDA SPL licensing](https://open.fda.gov/data/spl/)
- [Official label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8f55d5de-5a4f-4a39-8c84-c53976dd6af9)
- [DDInter terms](https://ddinter2.scbdd.com/terms/)
- [DDInter publication](https://pubmed.ncbi.nlm.nih.gov/39180399/)
- [FDA CYP reference](https://www.fda.gov/drugs/drug-interactions-labeling/healthcare-professionals-fdas-examples-drugs-interact-cyp-enzymes-and-transporter-systems)

The release maps explicit contraindications to high. Other label precautions retain the source instruction and use the other display category. No source severity is inferred from a mechanism.

Run `node datasets/validation/reference-cases.ts` to check the application output against the four cited source cases. These are deterministic software reference cases. The dataset validation workbook includes a form for pharmacist and clinical reviewer sign-off. A pending review carries no clinical validation claim.
