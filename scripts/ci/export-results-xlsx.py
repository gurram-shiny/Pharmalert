import argparse
import json
import os
import re
import zipfile
from xml.sax.saxutils import escape


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"


def column_name(number):
    letters = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def safe_text(value):
    text = str(value)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return escape(text, {'"': "&quot;"})


def cell_xml(reference, value):
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return f'<c r="{reference}"><v>{int(value)}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{reference}"><v>{value}</v></c>'
    return (
        f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">'
        f"{safe_text(value)}</t></is></c>"
    )


def worksheet_xml(rows):
    output = [f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              f'<worksheet xmlns="{MAIN_NS}"><sheetData>']
    for row_number, row in enumerate(rows, start=1):
        output.append(f'<row r="{row_number}">')
        for column_number, value in enumerate(row, start=1):
            output.append(cell_xml(f"{column_name(column_number)}{row_number}", value))
        output.append("</row>")
    output.append("</sheetData></worksheet>")
    return "".join(output)


def graph(passed, failed):
    total = passed + failed
    if not total:
        return "No test report"
    width = 20
    green = round(width * passed / total)
    return f"[{'#' * green}{'!' * (width - green)}] {passed} passed / {failed} failed"


def make_sheets(reports):
    summary = [[
        "Suite", "Evidence file / gate", "Check", "Result", "Passed", "Failed", "Graph", "Details",
    ]]
    details = [[
        "Suite", "Evidence file", "Case ID", "Description", "Expected", "Actual", "Status", "Timestamp",
    ]]
    for report in reports:
        suite = report.get("suite", "Unknown suite")
        for row in report.get("summaryRows", []):
            passed = int(row.get("passed", 0) or 0)
            failed = int(row.get("failed", 0) or 0)
            summary.append([
                suite, row.get("file", ""), row.get("name", ""), row.get("status", "NOT RUN"),
                passed, failed, graph(passed, failed), row.get("details", ""),
            ])
        for row in report.get("caseRows", []):
            details.append([
                suite, row.get("file", ""), row.get("id", ""), row.get("description", ""),
                row.get("expected", ""), row.get("actual", ""), row.get("status", "NOT RUN"),
                row.get("timestamp", ""),
            ])
    return [("Summary", summary), ("Case details", details)]


def write_workbook(reports, output):
    sheets = make_sheets(reports)
    sheet_tags = "".join(
        f'<sheet name="{safe_text(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, (name, _) in enumerate(sheets, start=1)
    )
    content_overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
        f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(sheets) + 1)
    )
    workbook_rels = "".join(
        f'<Relationship Id="rId{index}" Type="{REL_NS}/worksheet" '
        f'Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, len(sheets) + 1)
    )
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Types xmlns="{CONTENT_NS}">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f'{content_overrides}</Types>')
        archive.writestr("_rels/.rels",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Relationships xmlns="{PKG_REL_NS}">'
            f'<Relationship Id="rId1" Type="{REL_NS}/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>')
        archive.writestr("xl/workbook.xml",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<workbook xmlns="{MAIN_NS}" xmlns:r="{REL_NS}">'
            f'<sheets>{sheet_tags}</sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels",
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Relationships xmlns="{PKG_REL_NS}">{workbook_rels}</Relationships>')
        for index, (_, rows) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", worksheet_xml(rows))


def main():
    parser = argparse.ArgumentParser(description="Export CI suite results as an Excel workbook.")
    parser.add_argument("input", help="Suite results JSON file.")
    parser.add_argument("output", help="Path for the .xlsx workbook.")
    args = parser.parse_args()
    with open(args.input, encoding="utf-8-sig") as source:
        report = json.load(source)
    write_workbook([report], args.output)


if __name__ == "__main__":
    main()
