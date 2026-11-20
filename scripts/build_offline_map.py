"""Refresh the offline HTML and ZIP from the website service catalog."""

import json
from html import escape
from itertools import groupby
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "citadel-first-use-case"
SOURCE = OUTPUT / "Citadel-Service-Map.html"
LAYERS = {1: "Governance Hub", 2: "Agent Operations", 3: "Agent Management", 4: "Security Foundation"}


def service_entry(row):
    fields = [
        ("Pilot stage", "stage"), ("When to use", "when"), ("Placement", "topology"),
        ("Type", "kind"), ("Dimension", "dimension"), ("Evidence", "evidence"),
        ("Zone support", "zoneSupport"), ("AZ1", "zone1"), ("AZ2", "zone2"), ("AZ3", "zone3"),
        ("Microsoft Bicep", "bicep"), ("Microsoft Terraform", "terraform"),
        ("Template notes", "iacNote"), ("Planning notes", "note"),
    ]
    facts = "".join(f"<dt>{label}</dt><dd>{escape(row[key])}</dd>" for label, key in fields if row[key])
    sources = [
        ("Source", "source"), ("Supporting source", "other"), ("Bicep source", "bicepSrc"),
        ("Terraform source", "terraformSrc"), ("Zone selection", "zoneSource"), ("Zone support", "reliability"),
    ]
    links = [f'<a href="{escape(row[key])}">{label}</a>' for label, key in sources if row[key]]
    return (f'<section><h4>{escape(row["component"])}</h4><p>{escape(row["purpose"])}</p>'
            f'<dl>{facts}</dl><p>{" · ".join(links)}</p></section>')


def layer_content(number, name, rows):
    title = f"Layer {number} · {name}"
    sections = []
    for i, (zone, uses) in enumerate(groupby(rows, key=lambda row: row["landing"]), 1):
        anchor = f"layer-{number}-zone-{i}"
        sections.append(f'<h3 id="{anchor}">{escape(zone)}</h3>')
        for service, entries in groupby(uses, key=lambda row: row["service"]):
            entry_text = "".join(service_entry(row) for row in entries)
            sections.append(f'<details><summary>{escape(service)}</summary>{entry_text}</details>')
    return (f'<section id="read-layer-{number}"><h2>{title}</h2>{"".join(sections)}'
            '<p><a href="#read-contents">Back to layers</a></p></section>')


def refresh_reading_view(source, layers):
    start = "<!-- Start of generated reading view -->"
    end = "<!-- End of generated reading view -->"
    before, remainder = source.split(start)
    _, after = remainder.split(end)
    links = [f'<li><a href="#read-layer-{n}">Layer {n} · {name}</a></li>' for n, name in LAYERS.items()]
    view = ['<div class="reading-view" id="reading-view"><nav id="read-contents" aria-label="Layers">',
            '<h2>Browse by layer</h2><p>Tap a layer, then a service to see its uses.</p>',
            f'<ul>{"".join(links)}</ul></nav>', *layers, '</div>']
    updated = before + start + "\n" + "\n".join(view) + "\n  " + end + after
    return updated


def build_offline_map():
    records = json.loads((ROOT / "docs/data/catalog.json").read_text(encoding="utf-8"))
    rows = [{k: v for k, v in record.items() if k != "id"} for record in records]
    source = SOURCE.read_text(encoding="utf-8")
    opening = '<script type="application/json" id="inventory">'
    before, rest = source.split(opening)
    _, after = rest.split("</script>", 1)
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    source = before + opening + payload + "</script>" + after
    layers = []
    for number, name in LAYERS.items():
        uses = sorted((r for r in rows if r["layer"] == number),
                      key=lambda r: (r["landing"], r["service"], r["component"]))
        layers.append(layer_content(number, name, uses))
    SOURCE.write_text(refresh_reading_view(source, layers), encoding="utf-8")
    with ZipFile(OUTPUT / "Citadel-Service-Map-HTML.zip", "w") as bundle:
        bundle.writestr(ZipInfo(SOURCE.name), SOURCE.read_bytes(), compress_type=ZIP_DEFLATED)


if __name__ == "__main__":
    build_offline_map()
