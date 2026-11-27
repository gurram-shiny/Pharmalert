# QA evidence

Workbook reports live in the associated output folder. The Selenium runner writes structured evidence to `reports/evidence/selenium.json`. The Appium and k6 runners write their corresponding evidence when configured and executed. A result marked NOT RUN has no execution timestamp. Clinical review is recorded independently of source and software verification.

The GitHub quality workflow publishes a separate job summary and Excel workbook as each suite finishes. Each suite artifact contains only that suite's file-level summary and detailed case results; no final aggregation job is needed.
