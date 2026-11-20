"""Build both iPad downloads and refresh the HTML reading view from the embedded inventory. Requires lxml."""

import json
from datetime import UTC, datetime
from html import escape
from itertools import groupby
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

from lxml import html

OUTPUT = Path(__file__).resolve().parents[1] / "outputs" / "citadel-first-use-case"
SOURCE = OUTPUT / "Citadel-Service-Map.html"
LAYERS = {1: "Governance Hub", 2: "Agent Operations", 3: "Agent Management", 4: "Security Foundation"}
XHTML = "http://www.w3.org/1999/xhtml"
EPUB = "http://www.idpf.org/2007/ops"
READING_STYLE = """
body { font: 1em/1.5 Georgia, serif; margin: 5%; }
h1, h2, h3, h4, dt { font-family: -apple-system, Helvetica, sans-serif; text-align: left; }
h1 { line-height: 1.15; } h2 { margin-top: 1.6em; } h3, h4 { margin-bottom: .25em; }
dt { font-weight: bold; } dd { margin: 0 0 .6em; }
li { margin: .45em 0; } section { margin-bottom: 1.5em; }
"""


def chapter(title, body):
    return f'''<html xmlns="{XHTML}" xmlns:epub="{EPUB}" lang="en" xml:lang="en">
<head><title>{escape(title)}</title><style>{READING_STYLE}</style></head>
<body>{body}</body></html>'''


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


def layer_content(number, name, rows, *, preview=False):
    title = f"Layer {number} · {name}"
    zone_heading = "h3" if preview else "h2"
    index = []
    sections = []
    for i, (zone, uses) in enumerate(groupby(rows, key=lambda row: row["landing"]), 1):
        anchor = f"layer-{number}-zone-{i}"
        index.append(f'<li><a href="#{anchor}">{escape(zone)}</a></li>')
        sections.append(f'<{zone_heading} id="{anchor}">{escape(zone)}</{zone_heading}>')
        for service, entries in groupby(uses, key=lambda row: row["service"]):
            entry_text = "".join(service_entry(row) for row in entries)
            if preview:
                sections.append(f'<details><summary>{escape(service)}</summary>{entry_text}</details>')
            else:
                sections.append(f'<h3>{escape(service)}</h3>{entry_text}')
    if preview:
        return (f'<section id="read-layer-{number}"><h2>{title}</h2>{"".join(sections)}'
                '<p><a href="#read-contents">Back to layers</a></p></section>')
    return (f'<p><a href="contents.xhtml">Contents</a></p><h1>{title}</h1>'
            f'<ul>{"".join(index)}</ul>{"".join(sections)}')


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
    if updated != source:
        SOURCE.write_text(updated, encoding="utf-8")


def build_book():
    source = SOURCE.read_text(encoding="utf-8")
    doc = html.document_fromstring(source)
    rows = json.loads(doc.get_element_by_id("inventory").text)
    rows.sort(key=lambda r: (r["layer"], r["landing"], r["service"], r["component"]))
    code, = doc.xpath("//script[not(@type)]")
    files = {"map.js": code.text}
    code.text = ""
    code.set("src", "map.js")
    doc.set("xmlns", XHTML)
    doc.set("lang", "en")
    # The static chapters remain reachable even if the reader disables scripts.
    contents_link = html.fragment_fromstring('<p><a href="contents.xhtml">Browse by layer</a></p>')
    doc.find(".//header/div").append(contents_link)
    contents_link[0].set("style", "color:inherit")
    previous_view = doc.get_element_by_id("reading-view", None)
    if previous_view is not None:
        previous_view.drop_tree()
    files["map.xhtml"] = html.tostring(doc, encoding="unicode", method="xml")
    preview_layers = []
    for number, name in LAYERS.items():
        layer_rows = [r for r in rows if r["layer"] == number]
        preview_layers.append(layer_content(number, name, layer_rows, preview=True))
        files[f"layer-{number}.xhtml"] = chapter(f"Layer {number} · {name}", layer_content(number, name, layer_rows))
    refresh_reading_view(source, preview_layers)
    with ZipFile(OUTPUT / "Citadel-Service-Map-HTML.zip", "w") as bundle:
        bundle.writestr(ZipInfo(SOURCE.name), SOURCE.read_bytes(), compress_type=ZIP_DEFLATED)
    links = [("map", "Interactive map"), *[(f"layer-{n}", f"Layer {n} · {s}") for n, s in LAYERS.items()]]
    items = "".join(f'<li><a href="{key}.xhtml">{name}</a></li>' for key, name in links)
    files["contents.xhtml"] = chapter("Contents", '<h1>Citadel service map</h1>'
                                     '<p>Use the map to filter services, or choose a layer to read offline.</p>'
                                     f'<nav epub:type="toc"><h2>Contents</h2><ol>{items}</ol></nav>')
    modified = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    pages = "".join(f'<item id="{key}" href="{key}.xhtml" media-type="application/xhtml+xml"'
                    + (' properties="scripted"' if key == "map" else "") + "/>" for key, _ in links)
    spine = "".join(f'<itemref idref="{key}"/>' for key, _ in links)
    files["package.opf"] = f'''<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:7ec6faea-dcd0-4850-a566-faa8d6414d8a</dc:identifier>
<dc:title>Citadel service map</dc:title><dc:language>en</dc:language><dc:creator>Miguel P Z</dc:creator>
<dc:rights>MIT. See License and credits in the interactive map.</dc:rights>
<meta property="dcterms:modified">{modified}</meta><meta property="rendition:flow">scrolled-continuous</meta>
<meta property="rendition:spread">none</meta></metadata>
<manifest><item id="contents" href="contents.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="script" href="map.js" media-type="text/javascript"/>{pages}</manifest>
<spine>{spine}<itemref idref="contents"/></spine></package>'''
    container = ('<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>'
                 '</rootfiles></container>')
    with ZipFile(OUTPUT / "Citadel-Service-Map-iPad.epub", "w") as book:
        book.writestr(ZipInfo("mimetype"), "application/epub+zip", compress_type=ZIP_STORED)
        book.writestr("META-INF/container.xml", container, compress_type=ZIP_DEFLATED)
        for path, content in files.items():
            book.writestr("EPUB/" + path, content, compress_type=ZIP_DEFLATED)


if __name__ == "__main__":
    build_book()
