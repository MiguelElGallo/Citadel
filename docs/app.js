const $ = (id) => document.getElementById(id);
const layers = [
  "",
  "Governance Hub",
  "Agent Operations",
  "Agent Management",
  "Security Foundation",
];
const layerGlyph = ["", "shield", "stack", "organize", "lock"];
const paths = {
  shield:
    '<path d="m12 3 8 3v5c0 4.4-3.3 7.9-8 10-4.7-2.1-8-5.6-8-10V6z"/><path d="m8.6 11.8 2.1 2.2 4.9-5"/>',
  stack: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  organize:
    '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="15" width="6" height="5" rx="1"/><rect x="16" y="15" width="6" height="5" rx="1"/><path d="M12 8v4M5 15v-3h14v3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
  sliders:
    '<path d="M3 6h6m4 0h8M3 12h11m4 0h3M3 18h2m4 0h12"/><circle cx="11" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  repo: '<path d="M4 5a2 2 0 0 1 2-2h13v15H7a3 3 0 0 0 0 4h12V3M4 5v14a3 3 0 0 0 3 3"/><path d="m10 8-2 2 2 2m4-4 2 2-2 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  gateway: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  monitor: '<path d="M3 4v15h18M5 14l4-4 4 2 6-7"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 3.8 16 3.8 16 0V5M4 12c0 3.8 16 3.8 16 0"/>',
  compute:
    '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-4-8-3 3m7 1-3 3"/>',
};
function icon(name) {
  return (
    '<svg class="ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths[name] +
    "</svg>"
  );
}
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function link(href, label, klass = "") {
  return (
    '<a class="' + klass + '" href="' + esc(href) + '">' + esc(label) + "</a>"
  );
}
function params() {
  return new URLSearchParams(location.search);
}
function url(changes) {
  const next = new URL(location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  return next.pathname + next.search;
}
let catalog, connections, diagrams, icons, byId;
const filterDefs = [
  ["stage", "Pilot stage", "All stages"],
  ["landing", "Landing zone or scope", "All landing zones"],
  ["topology", "Placement", "All placements"],
  ["dimension", "Dimension", "All dimensions"],
  ["bicep", "Microsoft Bicep", "Any Bicep finding"],
  ["terraform", "Microsoft Terraform", "Any Terraform finding"],
];
const filterKeys = ["q", "layer", ...filterDefs.map((d) => d[0]), "connected"];
const resetValues = Object.fromEntries(
  [...filterKeys, "page"].map((k) => [k, ""]),
);
const perPage = 12;
let lastOpener, currentUse, lastBrowseQuery;
const edgeIndex = new Map();
function navigate(changes, { replace = false, modal = false } = {}) {
  const next = url(changes);
  if (next === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](
    modal ? { openedUse: true } : null,
    "",
    next,
  );
  render();
}
function glyph(row) {
  if (/API|gateway/i.test(row.service)) return "gateway";
  if (/Monitor|Insights|Grafana/.test(row.service)) return "monitor";
  if (/SQL|Storage|DB|Redis/.test(row.service)) return "db";
  if (/Entra|Key Vault|identity/i.test(row.service)) return "key";
  if (/Foundry|Compute|Container|Virtual Machines/.test(row.service))
    return "compute";
  return layerGlyph[row.layer];
}
function placement(value) {
  const color =
    { Hub: "hub", Spoke: "spoke", "Hub and spoke": "both" }[value] || "other";
  return '<span class="place ' + color + '">' + esc(value) + "</span>";
}
function stage(value) {
  return (
    '<span class="stage ' +
    (value === "Start here" ? "start" : "") +
    '">' +
    esc(value) +
    "</span>"
  );
}
function useLink(row, label) {
  return (
    '<a data-use="' +
    esc(row.id) +
    '" href="' +
    esc(url({ use: row.id })) +
    '">' +
    label +
    "</a>"
  );
}
function createFilters() {
  const selectors = filterDefs.map(([key, label, any]) => {
    const values = [...new Set(catalog.map((r) => r[key]))].sort();
    if (key === "stage")
      values.sort(
        (a, b) =>
          ["Start here", "If needed", "Later"].indexOf(a) -
          ["Start here", "If needed", "Later"].indexOf(b),
      );
    return (
      "<label>" +
      label +
      '<select id="f-' +
      key +
      '" data-filter="' +
      key +
      '"><option value="">' +
      any +
      "</option>" +
      values.map((v) => "<option>" + esc(v) + "</option>").join("") +
      "</select></label>"
    );
  });
  $("filter-fields").innerHTML =
    selectors.slice(0, 4).join("") +
    '<details class="filter-group" id="template-filters"><summary>Microsoft templates</summary>' +
    selectors.slice(4).join("") +
    '</details><label class="check"><input id="connected" type="checkbox">Documented connections only</label>';
  $("layers").innerHTML = layers
    .slice(1)
    .map((name, i) => {
      const n = i + 1,
        count = catalog.filter((r) => r.layer === n).length;
      return (
        '<button type="button" class="layer-card layer-' +
        n +
        '" data-layer="' +
        n +
        '" aria-label="Layer ' +
        n +
        ", " +
        name +
        ", " +
        count +
        ' service uses"><span class="layer-icon">' +
        icon(layerGlyph[n]) +
        '</span><span class="layer-small">Layer ' +
        n +
        '<span class="number">' +
        count +
        "</span></span><strong>" +
        name +
        "</strong></button>"
      );
    })
    .join("");
}
function renderChips(p) {
  $("active-filters").innerHTML = filterKeys
    .filter((k) => p.get(k))
    .map((k) => {
      const v = p.get(k);
      let label =
        k === "q"
          ? "Search: " + v
          : k === "layer"
            ? "Layer " + v
            : k === "connected"
              ? "With connections"
              : v;
      if (k === "terraform" || k === "bicep")
        label = (k === "bicep" ? "Bicep" : "Terraform") + ": " + v;
      return (
        '<button type="button" class="chip" data-remove="' +
        k +
        '" aria-label="Remove ' +
        esc(label) +
        '">' +
        esc(label) +
        ' <span aria-hidden="true">×</span></button>'
      );
    })
    .join("");
}
function paginate(matches, p, key, target, noun) {
  const max = Math.max(1, Math.ceil(matches.length / perPage));
  const page = Math.min(Math.max(1, parseInt(p.get(key), 10) || 1), max);
  const start = (page - 1) * perPage;
  $(target).innerHTML = matches.length
    ? "<span>" +
      (start + 1) +
      "–" +
      Math.min(start + perPage, matches.length) +
      " of " +
      matches.length +
      " " +
      noun +
      '</span><div class="pager-buttons"><button type="button" class="soft-button" data-paging="' +
      key +
      '" data-page="' +
      (page - 1) +
      '" ' +
      (page <= 1 ? "disabled" : "") +
      '>Previous</button><button type="button" class="soft-button" data-paging="' +
      key +
      '" data-page="' +
      (page + 1) +
      '" ' +
      (page >= max ? "disabled" : "") +
      ">Next</button></div>"
    : "";
  return matches.slice(start, start + perPage);
}
function renderCatalog(p) {
  const layer = p.get("layer"),
    q = (p.get("q") || "").trim().toLowerCase();
  $("search").value = p.get("q") || "";
  $("connected").checked = p.get("connected") === "1";
  for (const [key] of filterDefs) $("f-" + key).value = p.get(key) || "";
  if (p.get("bicep") || p.get("terraform")) $("template-filters").open = true;
  for (const b of $("layers").children)
    b.setAttribute("aria-pressed", String(layer === b.dataset.layer));
  $("all-layers").disabled = !layer;
  const matches = catalog.filter(
    (r) =>
      (!layer || String(r.layer) === layer) &&
      (!p.get("connected") || edgeIndex.has(r.id)) &&
      filterDefs.every(([k]) => !p.get(k) || p.get(k) === r[k]) &&
      (!q ||
        [
          r.service,
          r.component,
          r.kind,
          r.purpose,
          r.when,
          r.dimension,
          r.landing,
          r.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
  const products = new Set(matches.map((r) => r.service)).size;
  $("count").textContent =
    matches.length +
    " service " +
    (matches.length === 1 ? "use" : "uses") +
    " · " +
    products +
    " " +
    (products === 1 ? "service or tool" : "services & tools");
  $("pilot-start").setAttribute(
    "aria-pressed",
    String(p.get("stage") === "Start here"),
  );
  renderChips(p);
  const rows = paginate(matches, p, "page", "pagination", "uses");
  $("rows").innerHTML = rows
    .map(
      (r) =>
        '<div class="table-row" role="row"><div class="service-name" role="cell"><span class="row-icon layer-' +
        r.layer +
        '">' +
        icon(glyph(r)) +
        "</span>" +
        useLink(
          r,
          "<strong>" +
            esc(r.service) +
            "</strong><small>" +
            esc(r.component) +
            "</small>",
        ) +
        '</div><div role="cell">' +
        placement(r.topology) +
        '</div><div role="cell">' +
        stage(r.stage) +
        "</div></div>",
    )
    .join("");
  $("empty").hidden = matches.length > 0;
}
function endpoint(name) {
  return (
    '<span class="endpoint">' +
    (icons[name]
      ? '<img src="' + esc(icons[name]) + '" alt="" width="24" height="24">'
      : "") +
    esc(name) +
    "</span>"
  );
}
function edgeCard(e, includeUses) {
  let related = "";
  if (includeUses)
    related =
      '<details class="edge-uses"><summary>Related service uses (' +
      e.uses.length +
      ')</summary><div class="related-uses">' +
      e.uses
        .map((id) => {
          const r = byId.get(id);
          return useLink(r, esc("L" + r.layer + " · " + r.component));
        })
        .join("") +
      "</div></details>";
  return (
    '<article class="edge-card"><div class="edge-route"><span class="sr">From </span>' +
    endpoint(e.from) +
    '<span class="direction" aria-hidden="true">→</span><span class="sr"> to </span>' +
    endpoint(e.to) +
    '</div><p class="edge-label">' +
    esc(e.label) +
    "</p>" +
    link(e.source, "Connection source", "evidence") +
    related +
    "</article>"
  );
}
function edgeSummary(edges) {
  const preview = edges
    .slice(0, 2)
    .map((e) => edgeCard(e, false))
    .join("");
  if (edges.length <= 2) return preview;
  return (
    preview +
    '<details class="more-edges"><summary>Show ' +
    (edges.length - 2) +
    " more connections</summary>" +
    edges
      .slice(2)
      .map((e) => edgeCard(e, false))
      .join("") +
    "</details>"
  );
}
function facts(rows) {
  return (
    '<dl class="facts">' +
    rows
      .filter(([, v]) => v)
      .map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>")
      .join("") +
    "</dl>"
  );
}
function section(title, body) {
  return (
    '<section class="dialog-section"><h3>' +
    title +
    "</h3>" +
    body +
    "</section>"
  );
}
function drawDetail(row) {
  const edges = edgeIndex.get(row.id) || [];
  const titles = [
    ["source", "Blueprint / service source"],
    ["other", "Supporting source"],
    ["bicepSrc", "Bicep source"],
    ["terraformSrc", "Terraform source"],
    ["zoneSource", "Zone selection"],
    ["reliability", "Zone support"],
  ];
  const sources = titles
    .filter(([key]) => row[key])
    .map(([key, name]) => link(row[key], name))
    .join("");
  const role =
    '<div class="detail-meta"><span class="layer-tag layer-' +
    row.layer +
    '">Layer ' +
    row.layer +
    " · " +
    esc(layers[row.layer]) +
    "</span>" +
    placement(row.topology) +
    "</div>";
  $("detail-body").innerHTML =
    '<div class="dialog-content">' +
    role +
    '<h2 id="detail-title">' +
    esc(row.service) +
    '</h2><p class="subheading">' +
    esc(row.component) +
    '</p><p class="purpose">' +
    esc(row.purpose) +
    "</p>" +
    '<div class="detail-actions"><button type="button" id="copy-link" class="soft-button">Copy link</button><span id="copy-feedback" role="status"></span></div>' +
    section(
      "When to use it",
      facts([
        ["Pilot stage", row.stage],
        ["When you need it", row.when],
        ["Landing zone", row.landing],
        ["Dimension", row.dimension],
        ["Type", row.kind],
        ["Evidence", row.evidence],
      ]) + (row.note ? '<p class="detail-note">' + esc(row.note) + "</p>" : ""),
    ) +
    section(
      "Connections",
      edges.length
        ? edgeSummary(edges)
        : '<p class="detail-note">No connection is mapped for this use. See the sources below.</p>',
    ) +
    section(
      "Microsoft templates",
      facts([
        ["Bicep", row.bicep],
        ["Terraform", row.terraform],
        ["Template notes", row.iacNote],
      ]) +
        '<div class="source-links">' +
        [
          ["bicepSrc", "Bicep source"],
          ["terraformSrc", "Terraform source"],
        ]
          .filter(([k]) => row[k])
          .map(([k, t]) => link(row[k], t))
          .join("") +
        "</div>",
    ) +
    section(
      "Availability zones",
      facts([
        ["Service support", row.zoneSupport],
        ["Zone 1", row.zone1],
        ["Zone 2", row.zone2],
        ["Zone 3", row.zone3],
      ]) +
        '<p class="detail-note">Numbered zones describe the cited example. Check your region and service tier when planning a deployment.</p>',
    ) +
    section("Sources", '<div class="source-links">' + sources + "</div>") +
    "</div>";
  $("copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("copy-feedback").textContent = "Link copied";
    } catch {
      $("copy-feedback").textContent =
        "Copy this page’s address from your browser.";
    }
  };
}
function syncDialog(p) {
  const id = p.get("use"),
    dialog = $("detail");
  const row = byId.get(id);
  if (!id) {
    if (dialog.open) {
      dialog.close();
      (lastOpener?.isConnected
        ? lastOpener
        : document.querySelector(
            '[data-use="' + CSS.escape(currentUse || "") + '"]',
          ) || $("results-title")
      ).focus({ preventScroll: true });
    }
    currentUse = null;
    return;
  }
  if (id !== currentUse) {
    if (row) drawDetail(row);
    else
      $("detail-body").innerHTML =
        '<div class="dialog-content"><h2 id="detail-title">Service use unavailable</h2><p class="detail-note">Close this panel to browse the catalog.</p></div>';
    currentUse = id;
    dialog.scrollTop = 0;
  }
  if (!dialog.open) dialog.showModal();
}
function closeDetail() {
  if (history.state?.openedUse) history.back();
  else navigate({ use: "" }, { replace: true });
}
function renderArchitecture(p) {
  if (!$("gallery").children.length)
    $("gallery").innerHTML = diagrams
      .map(
        (d, i) =>
          '<button type="button" data-image="' +
          i +
          '"><img loading="lazy" src="' +
          esc(d.preview) +
          '" alt="' +
          esc(d.alt) +
          '"><strong>' +
          esc(d.title) +
          "</strong></button>",
      )
      .join("");
  const query = p.get("find") || "";
  $("connection-search").value = query;
  const matches = connections.filter((e) =>
    [e.from, e.label, e.to]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  $("edge-count").textContent =
    matches.length +
    " documented " +
    (matches.length === 1 ? "connection" : "connections");
  const page = paginate(matches, p, "edgePage", "edge-pages", "connections");
  $("edges").innerHTML = page.length
    ? page.map((e) => edgeCard(e, true)).join("")
    : '<div class="empty"><h3>No matching connections</h3><button type="button" class="soft-button" id="edge-reset">Clear search</button></div>';
}
function render() {
  const p = params(),
    arch = p.get("view") === "architecture";
  $("catalog").hidden = arch;
  $("architecture").hidden = !arch;
  document.querySelectorAll("[data-view]").forEach((a) => {
    if (a.dataset.view === (arch ? "architecture" : "catalog"))
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title =
    (byId.get(p.get("use"))?.service ||
      (arch ? "Architecture" : "Service explorer")) + " · Citadel Atlas";
  const browseQuery = new URLSearchParams(p);
  browseQuery.delete("use");
  if (browseQuery.toString() !== lastBrowseQuery) {
    if (arch) renderArchitecture(p);
    else renderCatalog(p);
    lastBrowseQuery = browseQuery.toString();
  }
  syncDialog(p);
}
function setMobileFilters(open) {
  $("filters").classList.toggle("expanded", open);
  $("mobile-filters").setAttribute("aria-expanded", String(open));
  if (open) {
    $("filters").scrollIntoView({ block: "start" });
    $("f-stage").focus({ preventScroll: true });
  }
}
function showImage(index) {
  const item = diagrams[index];
  if (!item) return;
  $("image-title").textContent = item.title;
  $("image-content").innerHTML =
    '<img src="' +
    esc(item.src) +
    '" alt="' +
    esc(item.alt) +
    '"><p>' +
    esc(item.alt) +
    '</p><p class="credit">' +
    esc(item.credit) +
    '</p><div class="diagram-links">' +
    link(item.src, "Open full-size image") +
    link(item.source, "Original source") +
    "</div>";
  $("image-dialog").showModal();
}
function bind() {
  document.addEventListener("click", (event) => {
    const hit = event.target.closest("a,button");
    if (
      !hit ||
      hit.disabled ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (hit.dataset.use) {
      event.preventDefault();
      lastOpener = hit;
      navigate({ use: hit.dataset.use }, { modal: true });
    } else if (hit.dataset.view) {
      event.preventDefault();
      navigate({
        view: hit.dataset.view === "architecture" ? "architecture" : "",
        use: "",
      });
      if (hit.dataset.view === "architecture")
        $("workspace").scrollIntoView({ block: "start" });
    } else if (hit.dataset.layer) {
      navigate({
        layer:
          params().get("layer") === hit.dataset.layer ? "" : hit.dataset.layer,
        page: "",
      });
    } else if (hit.dataset.remove)
      navigate({ [hit.dataset.remove]: "", page: "" });
    else if (hit.dataset.paging) {
      navigate({
        [hit.dataset.paging]: hit.dataset.page === "1" ? "" : hit.dataset.page,
      });
      const target =
        hit.dataset.paging === "page"
          ? $("results-title")
          : $("connection-search");
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    } else if (hit.dataset.image !== undefined)
      showImage(Number(hit.dataset.image));
    else if (hit.id === "edge-reset") navigate({ find: "", edgePage: "" });
  });
  $("filters").addEventListener("change", (e) => {
    if (e.target.dataset.filter)
      navigate({ [e.target.dataset.filter]: e.target.value, page: "" });
    if (e.target.id === "connected")
      navigate({ connected: e.target.checked ? "1" : "", page: "" });
  });
  $("search").oninput = (e) =>
    navigate({ q: e.target.value, page: "" }, { replace: true });
  $("connection-search").oninput = (e) =>
    navigate({ find: e.target.value, edgePage: "" }, { replace: true });
  $("pilot-start").onclick = () =>
    navigate({
      stage: params().get("stage") === "Start here" ? "" : "Start here",
      page: "",
    });
  $("all-layers").onclick = () => navigate({ layer: "", page: "" });
  $("clear").onclick = $("empty-reset").onclick = () => navigate(resetValues);
  $("mobile-filters").onclick = () =>
    setMobileFilters(!$("filters").classList.contains("expanded"));
  $("apply-mobile").onclick = () => {
    setMobileFilters(false);
    $("mobile-filters").focus();
  };
  $("close-detail").onclick = closeDetail;
  $("detail").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDetail();
  });
  $("detail").addEventListener("click", (e) => {
    if (
      e.target === $("detail") &&
      e.clientX < $("detail").getBoundingClientRect().left
    )
      closeDetail();
  });
  $("close-image").onclick = () => $("image-dialog").close();
  window.addEventListener("popstate", render);
}
async function start() {
  for (const node of document.querySelectorAll("[data-icon]"))
    node.innerHTML = icon(node.dataset.icon);
  [catalog, connections, diagrams, icons] = await Promise.all(
    [
      "data/catalog.json",
      "data/connections.json",
      "assets/diagrams.json",
      "assets/icons.json",
    ].map(async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw Error(path);
      return res.json();
    }),
  );
  byId = new Map(catalog.map((r) => [r.id, r]));
  for (const edge of connections)
    for (const id of edge.uses) {
      if (!edgeIndex.has(id)) edgeIndex.set(id, []);
      edgeIndex.get(id).push(edge);
    }
  createFilters();
  bind();
  $("load-status").hidden = true;
  render();
}
start().catch(() => {
  $("load-status").hidden = false;
  $("load-status").innerHTML =
    'The catalog could not load. <a href="">Reload this page</a> or <a href="https://github.com/MiguelElGallo/Citadel/raw/refs/heads/main/outputs/citadel-first-use-case/Citadel-Service-Planner.xlsx">open the Excel planner</a>.';
});
