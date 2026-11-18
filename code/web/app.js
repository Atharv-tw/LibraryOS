// Library Book Management System: website frontend.
// The page only draws; every action is a call to server.py, which runs library_core.py.

const view = document.getElementById("view");
const PAGES = {
  dashboard: ["Dashboard", "A live view of the catalogue, the request queue, the waitlists and the return stack."],
  search: ["Search Catalogue", "The catalogue is kept sorted by title with merge sort, so exact titles and prefixes can use binary search."],
  issue: ["Issue Desk", "Requests are served first-come-first-served from a queue. If no copy is free the member joins that book's waitlist."],
  returns: ["Returns Desk", "Returned books are time-stamped, fined for late days and pushed onto a stack. Reshelving pops from the top."],
  members: ["Members", "Every member's loans, due dates, fines and waitlist positions."],
  reports: ["Reports", "Overdue loans and borrowing patterns, all derived from the issue and return timestamps."],
  lab: ["Algorithm Lab", "Times the backend's own merge sort, linear search and binary search on catalogues of growing size."],
  log: ["Activity Log", "Every request, issue, waitlist, return, fine and reshelve, newest first."],
};
let S = null;               // latest /api/state snapshot
let CAT = null;             // books and members for the forms
const lastEvents = {};      // events from the last action, per page
let benchRows = null;

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-IN");

async function api(path, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  return res.json();
}

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

async function refresh() {
  [S, CAT] = await Promise.all([api("/api/state"), api("/api/catalogue")]);
  document.getElementById("nav-queue").textContent = S.stats.queue || "";
  document.getElementById("nav-stack").textContent = S.stats.stack || "";
  document.getElementById("clock-date").value = S.date;
}

function eventClass(t) {
  if (t.startsWith("issued")) return "issued";
  if (t.includes("waitlist for") && t.includes("added")) return "wait";
  if (t.includes("fine")) return "fine";
  if (t.startsWith("reshelved")) return "reshelve";
  if (t.startsWith("refused") || t.startsWith("skipped")) return "refused";
  return "";
}
const eventsHtml = (events) => events.length
  ? `<div class="events">${events.map((e) => `<div class="event ${eventClass(e.text)}"><time>${esc(e.time)}</time><span>${esc(e.text)}</span></div>`).join("")}</div>`
  : "";

const ICONS = {
  book: '<svg viewBox="0 0 24 24"><path d="M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h11V4zm2 2h7v2H8z"/></svg>',
  shelf: '<svg viewBox="0 0 24 24"><path d="M3 20h18v2H3zM5 4h3v14H5zm4.5 2h3v12h-3zm4.8-1.6 2.9-.8 3.4 13.5-2.9.7z"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5v3H3v4h7zm9-14h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>',
  people: '<svg viewBox="0 0 24 24"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0h-1a4.2 4.2 0 0 1 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M3 9h4v6H3zm6 0h4v6H9zm6 0h4v6h-4zm5 1 3 2-3 2z"/></svg>',
  wait: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.3 2-1 1.6L11 13V7h2z"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><path d="M4 16h16v3H4zm1-5h14v3H5zm2-5h10v3H7z"/></svg>',
};
function stat(label, value, icon, color, extra = "") {
  return `<div class="card stat"><div class="label"><span class="ico ${color}">${ICONS[icon]}</span>${label}</div>
    <div class="value">${value}${extra ? ` <small>${extra}</small>` : ""}</div></div>`;
}

function lane(items, limit = 8) {
  if (!items.length) return `<div class="lane"><div class="empty">Queue is empty</div></div>`;
  const chips = items.slice(0, limit).map((it, i) => `<div class="chip ${i === 0 ? "first" : ""}">
      <div class="k">${esc(it.k)}</div><div class="t">${esc(it.t)}</div>${it.s ? `<div class="s">${esc(it.s)}</div>` : ""}</div>`).join("");
  const more = items.length > limit ? `<div class="more">+${items.length - limit} more</div>` : "";
  return `<div class="lane"><div class="lane-end">FRONT</div>${chips}${more}<div class="lane-end">REAR</div></div>`;
}

function stackView(items, limit = 7) {
  if (!items.length) return `<div class="stack"><div class="empty">Return stack is empty</div></div>`;
  const spines = items.slice(0, limit).map((b, i) => `<div class="spine ${i === 0 ? "top" : ""}">
      <div class="t">${esc(b.title)}</div><div class="s">returned ${esc(b.time)}${i === 0 ? " · next to be popped" : ""}</div></div>`).join("");
  const more = items.length > limit ? `<div class="more">+${items.length - limit} more below</div>` : "";
  return `<div class="stack"><div class="end">TOP ↓</div>${spines}${more}<div class="end">BOTTOM</div></div>`;
}

// ------------------------------------------------------------------ SVG charts
const PALETTE = ["#3056d3", "#4b6fe0", "#6688ea", "#7f9ff0", "#98b3f4", "#afc4f7", "#c3d3f9", "#d3dffb", "#dfe7fc", "#e8eefd"];

function hbar(rows, { width = 620, labelW = 250 } = {}) {
  if (!rows.length) return `<div class="empty">No data yet.</div>`;
  const rowH = 27, H = rows.length * rowH + 6, max = Math.max(...rows.map((r) => r.value));
  const plotW = width - labelW - 40;
  const bars = rows.map((r, i) => {
    const w = Math.max(2, (r.value / max) * plotW), y = i * rowH + 4;
    return `<text class="lbl" x="${labelW - 10}" y="${y + 14}" text-anchor="end">${esc(r.label.length > 36 ? r.label.slice(0, 35) + "…" : r.label)}</text>
      <rect x="${labelW}" y="${y + 2}" width="${w}" height="${rowH - 9}" rx="5" fill="${PALETTE[Math.min(i, 9)]}"/>
      <text class="val" x="${labelW + w + 7}" y="${y + 14}">${r.value}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${H}">${bars}</svg>`;
}

function niceMax(v, ticks = 4) {
  // Round the axis top up so every tick is 1, 2, 2.5 or 5 times a power of ten.
  const raw = Math.max(v, 1e-9) / ticks, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  return step * ticks;
}

function axes(W, H, pad, max, ticks = 4) {
  let g = '<g class="grid">';
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i, y = H - pad.b - (v / max) * (H - pad.t - pad.b);
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/><text x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${fmt(Math.round(v * 100) / 100)}</text>`;
  }
  return g + "</g>";
}

function vbar(rows, { width = 600, height = 260, marker = null, rotate = true, color = "#3056d3" } = {}) {
  if (!rows.length) return `<div class="empty">No data yet.</div>`;
  const pad = { l: 40, r: 10, t: 10, b: rotate ? 70 : 28 };
  const max = niceMax(Math.max(...rows.map((r) => r.value))), plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
  const bw = plotW / rows.length;
  let svg = axes(width, height, pad, max);
  rows.forEach((r, i) => {
    const h = (r.value / max) * plotH, x = pad.l + i * bw;
    const late = marker !== null && Number(r.label) > marker;
    svg += `<rect x="${x + bw * 0.14}" y="${height - pad.b - h}" width="${bw * 0.72}" height="${h}" rx="3" fill="${late ? "#d64545" : color}" opacity="${late ? 0.8 : 1}"/>`;
    const lx = x + bw / 2, ly = height - pad.b + 14;
    svg += rotate ? `<text class="lbl" transform="translate(${lx},${ly}) rotate(-35)" text-anchor="end">${esc(r.label)}</text>`
      : `<text x="${lx}" y="${ly}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  if (marker !== null) {
    const idx = rows.findIndex((r) => Number(r.label) > marker);
    if (idx > 0) {
      const x = pad.l + idx * bw;
      svg += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${height - pad.b}" stroke="#d64545" stroke-dasharray="5 4" stroke-width="1.5"/>
        <text x="${x + 6}" y="${pad.t + 12}" style="fill:#d64545;font-weight:650">due after ${marker} days → late</text>`;
    }
  }
  return `<svg class="chart" viewBox="0 0 ${width} ${height}">${svg}</svg>`;
}

function lineChart(labels, series, { width = 900, height = 260, every = 2 } = {}) {
  const pad = { l: 40, r: 14, t: 12, b: 30 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (width - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  let svg = axes(width, height, pad, max);
  labels.forEach((l, i) => { if (i % every === 0) svg += `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>`; });
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="6 5"' : ""}/>`;
    if (!s.dash) svg += s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2"/>`).join("");
  });
  const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}">${svg}</svg>${legend}`;
}

function xyChart(points, series, { width = 420, height = 250, yLabel = "" } = {}) {
  // points: x values (n); series: [{name, color, values, dash}]
  const pad = { l: 46, r: 12, t: 12, b: 34 };
  const maxX = Math.max(...points), maxY = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const x = (v) => pad.l + (v / maxX) * (width - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / maxY) * (height - pad.t - pad.b);
  let svg = axes(width, height, pad, maxY);
  points.forEach((p) => { svg += `<text x="${x(p)}" y="${height - 14}" text-anchor="middle">${p >= 1000 ? p / 1000 + "k" : p}</text>`; });
  svg += `<text x="${width / 2}" y="${height}" text-anchor="middle">n (books)</text>`;
  if (yLabel) svg += `<text x="4" y="${pad.t}" style="font-size:10.5px">${esc(yLabel)}</text>`;
  series.forEach((s) => {
    svg += `<polyline points="${s.values.map((v, i) => `${x(points[i])},${y(v)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4" ${s.dash ? 'stroke-dasharray="6 5"' : ""}/>`;
    if (!s.dash) svg += s.values.map((v, i) => `<circle cx="${x(points[i])}" cy="${y(v)}" r="3.4" fill="#fff" stroke="${s.color}" stroke-width="2"/>`).join("");
  });
  const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}">${svg}</svg>${legend}`;
}

// ------------------------------------------------------------------ pages
function dashboard() {
  const s = S.stats;
  view.innerHTML = `
  <div class="grid g4">
    ${stat("Titles in catalogue", s.titles, "book", "blue")}
    ${stat("Copies on the shelf", s.on_shelf, "shelf", "green", `of ${s.copies}`)}
    ${stat("Books issued now", s.issued, "out", "violet")}
    ${stat("Overdue now", s.overdue, "alert", "red")}
    ${stat("Members", s.members, "people", "gray")}
    ${stat("Request queue", s.queue, "queue", "blue")}
    ${stat("Waiting in waitlists", s.waiting, "wait", "blue")}
    ${stat("Return stack", s.stack, "stack", "amber")}
  </div>
  <div class="grid g32" style="margin-top:18px">
    <div class="card"><h2>Most popular books</h2><div class="sub">Times issued, from the transaction history</div>
      ${hbar(S.popular.map((p) => ({ label: p.title, value: p.count })))}</div>
    <div class="card"><h2>Recent activity</h2><div class="sub">Latest events from the backend log</div>
      ${S.recent.length ? eventsHtml(S.recent.slice(0, 9)) : '<div class="empty">No actions yet in this session.</div>'}</div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h2>Request queue <span class="tag blue">FIFO</span></h2><div class="sub">Served from the front, new requests join at the rear</div>
      ${lane(S.queue.map((q) => ({ k: q.member_id + " · " + q.member.split(" ")[0], t: q.title, s: q.time })), 4)}</div>
    <div class="card"><h2>Return stack <span class="tag amber">LIFO</span></h2><div class="sub">The most recently returned book is reshelved first</div>
      ${stackView(S.stack, 3)}</div>
  </div>`;
}

let searchMode = "exact", searchText = "Wings of Fire", bsStep = 0, bsTimer = null;
const MODES = {
  title: ["Title contains", "Linear search · O(n)", "the"],
  author: ["Author contains", "Linear search · O(n)", "orwell"],
  prefix: ["Title starts with", "Binary search + scan · O(log n + k)", "the a"],
  exact: ["Exact title", "Binary search · O(log n)", "Wings of Fire"],
};
async function search() {
  clearInterval(bsTimer);
  const r = await api(`/api/search?mode=${searchMode}&q=${encodeURIComponent(searchText)}`);
  const linear = searchMode === "title" || searchMode === "author";
  view.innerHTML = `
  <div class="card">
    <div class="modes">${Object.entries(MODES).map(([k, [a, b]]) => `<div class="mode ${k === searchMode ? "active" : ""}" data-mode="${k}"><b>${a}</b><span>${b}</span></div>`).join("")}</div>
    <form class="searchbar" id="sform"><input id="sq" value="${esc(searchText)}" placeholder="Type a title or author" autocomplete="off"><button class="btn">Search</button></form>
  </div>
  <div class="grid g4" style="margin-top:18px">
    ${stat("Books found", r.results.length, "book", "green")}
    ${stat("Comparisons made", r.comparisons, "queue", linear ? "violet" : "blue", linear ? `all ${r.n} books` : `max ${r.max_binary} for n = ${r.n}`)}
    ${stat("Time taken", r.micros, "wait", "gray", "µs")}
    ${stat("Linear search would check", r.n, "alert", "amber", "books")}
  </div>
  ${r.steps ? `<div class="card" style="margin-top:18px"><h2>Binary search, step by step <span class="tag blue">${r.steps.length} steps</span></h2>
    <div class="sub">Each step looks at the middle title of the range [lo, hi] and throws away the half that cannot contain the answer.</div>
    <div class="bs-strip" id="bs-strip" style="--n:${r.n}">${r.titles.map((t, i) => `<div class="bs-cell" title="${i}: ${esc(t)}"></div>`).join("")}</div>
    <div class="bs-axis"><span>0</span><span>sorted catalogue (index)</span><span>${r.n - 1}</span></div>
    <div class="bs-now" id="bs-now"></div>
    <div class="row" style="margin:10px 0 14px"><button class="btn ghost" id="bs-prev">◀ Previous</button><button class="btn ghost" id="bs-next">Next ▶</button><button class="btn" id="bs-play">▶ Play</button></div>
    <div class="table-wrap"><table class="steps"><thead><tr><th>Step</th><th class="num">lo</th><th class="num">mid</th><th class="num">hi</th><th>Title at mid</th><th>Decision</th></tr></thead>
    <tbody>${r.steps.map((s, i) => `<tr data-i="${i}"><td>${i + 1}</td><td class="num">${s.lo}</td><td class="num">${s.mid}</td><td class="num">${s.hi}</td><td>${esc(s["title at mid"])}</td><td>${esc(s.decision)}</td></tr>`).join("")}</tbody></table></div>
  </div>` : ""}
  <div class="card" style="margin-top:18px"><h2>Results</h2><div class="sub">${linear ? "Every book was compared with the search text." : "Found through the sorted catalogue."}</div>
    ${r.results.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Title</th><th>Author</th><th>Genre</th><th class="num">Year</th><th class="num">Free / total</th></tr></thead><tbody>
    ${r.results.map((b) => `<tr><td>${b.id}</td><td><b>${esc(b.title)}</b></td><td>${esc(b.author)}</td><td>${esc(b.genre)}</td><td class="num">${b.year}</td><td class="num">${b.free} / ${b.total}</td></tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">No matching book.</div>'}</div>`;

  view.querySelectorAll(".mode").forEach((m) => m.onclick = () => { searchMode = m.dataset.mode; searchText = MODES[searchMode][2]; bsStep = 0; search(); });
  document.getElementById("sform").onsubmit = (e) => { e.preventDefault(); searchText = document.getElementById("sq").value; bsStep = 0; search(); };
  if (r.steps) {
    const cells = [...document.querySelectorAll(".bs-cell")];
    const prefix = searchMode === "prefix";
    const show = (i) => {
      bsStep = Math.max(0, Math.min(i, r.steps.length - 1));
      const s = r.steps[bsStep], hiIncl = prefix ? s.hi - 1 : s.hi, hit = s.decision === "found";
      cells.forEach((c, k) => c.className = "bs-cell" + (k === s.mid ? (hit ? " hit" : " mid") : k >= s.lo && k <= hiIncl ? " in" : ""));
      document.getElementById("bs-now").innerHTML = `<div><div class="k">lo</div><div class="v">${s.lo}</div></div><div><div class="k">mid</div><div class="v">${s.mid}</div></div>
        <div><div class="k">hi</div><div class="v">${s.hi}</div></div><div><div class="k">left in range</div><div class="v">${hiIncl - s.lo + 1}</div></div>
        <div><div class="k">title at mid → decision</div><div class="v title">${esc(s["title at mid"])} → <span class="tag ${hit ? "green" : "blue"}">${esc(s.decision)}</span></div></div>`;
      document.querySelectorAll(".steps tr[data-i]").forEach((tr) => tr.querySelectorAll("td").forEach((td) => td.classList.toggle("cur", Number(tr.dataset.i) === bsStep)));
    };
    show(Math.min(bsStep, r.steps.length - 1));
    document.getElementById("bs-prev").onclick = () => show(bsStep - 1);
    document.getElementById("bs-next").onclick = () => show(bsStep + 1);
    document.getElementById("bs-play").onclick = () => {
      clearInterval(bsTimer); show(0);
      bsTimer = setInterval(() => { if (bsStep >= r.steps.length - 1) clearInterval(bsTimer); else show(bsStep + 1); }, 900);
    };
  }
}

function memberOptions(onlyHolders = false) {
  return CAT.members.filter((m) => !onlyHolders || m.held > 0)
    .map((m) => `<option value="${m.id}">${m.id} · ${esc(m.name)} (${m.held} held)</option>`).join("");
}

function issue() {
  const r = S.rules;
  view.innerHTML = `
  <div class="grid g23">
    <div class="card"><h2>New request <span class="tag blue">enqueue</span></h2><div class="sub">The request joins the rear of the queue with a timestamp.</div>
      <div class="field"><label>Member</label><select id="i-member">${memberOptions()}</select></div>
      <div class="field"><label>Book</label><select id="i-book">${CAT.books.map((b) => `<option value="${b.id}">${esc(b.title)} — ${esc(b.author)} (${b.free}/${b.total} free)</option>`).join("")}</select></div>
      <div class="hint">Rules: at most <b>${r.max_books}</b> books per member · loan period <b>${r.loan_days}</b> days · fine <b>Rs. ${r.fine_per_day}</b> per late day.</div>
      <button class="btn" id="i-add">Add to request queue</button>
    </div>
    <div class="card"><h2>Request queue <span class="tag blue">FIFO · ${S.queue.length}</span></h2><div class="sub">Processing dequeues from the front until the queue is empty.</div>
      ${lane(S.queue.map((q) => ({ k: q.member_id + " · " + q.member.split(" ")[0], t: q.title, s: "asked " + q.time })))}
      <div class="row" style="margin-top:14px"><button class="btn" id="i-process" ${S.queue.length ? "" : "disabled"}>Process request queue (dequeue)</button></div>
      ${eventsHtml(lastEvents.issue || [])}
    </div>
  </div>
  <div class="card" style="margin-top:18px"><h2>Waitlists <span class="tag blue">one queue per book</span></h2>
    <div class="sub">When a copy comes back and is reshelved, the member at the front of that book's waitlist gets it.</div>
    ${S.waitlists.length ? S.waitlists.slice(0, 5).map((w) => `<div class="waitlist"><div class="head"><b>${esc(w.title)}</b><span class="muted">${w.free}/${w.total} free · ${w.members.length} waiting</span></div>
      ${lane(w.members.map((m) => ({ k: m.member_id, t: "since " + m.since })), 8).replaceAll('class="chip', 'class="chip small')}</div>`).join("")
      : '<div class="empty">Nobody is waiting for a book.</div>'}
  </div>`;
  document.getElementById("i-add").onclick = async () => {
    const out = await api("/api/request", { member_id: val("i-member"), book_id: val("i-book") });
    lastEvents.issue = out.events;
    out.ok ? toast("Request added to the rear of the queue") : toast(out.error, true);
    await refresh(); issue();
  };
  document.getElementById("i-process").onclick = async () => {
    const out = await api("/api/process", {});
    lastEvents.issue = out.events;
    toast(`Queue processed: ${out.issued} book(s) issued`);
    await refresh(); issue();
  };
}
const val = (id) => document.getElementById(id).value;

let returnMember = null;
async function returns() {
  const holders = CAT.members.filter((m) => m.held > 0);
  if (!holders.find((m) => m.id === returnMember)) returnMember = holders[0]?.id;
  const holding = returnMember ? await api(`/api/holding/${returnMember}`) : [];
  view.innerHTML = `
  <div class="grid g32">
    <div class="card"><h2>Return a book <span class="tag amber">push</span></h2><div class="sub">The return is time-stamped, the fine is computed, and the book goes on top of the stack.</div>
      ${holders.length ? `<div class="field"><label>Member</label><select id="r-member">${memberOptions(true)}</select></div>
      <div class="field"><label>Book</label><select id="r-book">${holding.map((t) => `<option value="${t.book_id}">${esc(t.title)} (due ${t.due})</option>`).join("")}</select></div>
      <div class="hint" id="r-hint"></div>
      <button class="btn amber" id="r-return">Return book</button>` : '<div class="empty">No books are out.</div>'}
      ${eventsHtml(lastEvents.returns || [])}
    </div>
    <div class="card"><h2>Return stack <span class="tag amber">LIFO · ${S.stack.length}</span></h2><div class="sub">Reshelving pops the top book; a waiting member gets it at once.</div>
      ${stackView(S.stack)}
      <div class="row" style="margin-top:14px"><button class="btn amber" id="r-pop" ${S.stack.length ? "" : "disabled"}>Reshelve top book (pop)</button>
      <button class="btn ghost" id="r-all" ${S.stack.length ? "" : "disabled"}>Reshelve all</button></div>
    </div>
  </div>`;
  if (!holders.length) return;
  document.getElementById("r-member").value = returnMember;
  const hint = () => {
    const t = holding.find((h) => h.book_id === val("r-book"));
    if (!t) return;
    document.getElementById("r-hint").innerHTML = `Issued <b>${t.issued}</b> · due <b>${t.due}</b> · ` +
      (t.late_days ? `<b class="late">${t.late_days} days late → fine Rs. ${t.fine_now}</b>` : "on time, no fine");
  };
  hint();
  document.getElementById("r-book").onchange = hint;
  document.getElementById("r-member").onchange = () => { returnMember = val("r-member"); returns(); };
  document.getElementById("r-return").onclick = async () => {
    const out = await api("/api/return", { member_id: returnMember, book_id: val("r-book") });
    lastEvents.returns = out.events;
    out.ok ? toast(out.fine ? `Returned late: fine Rs. ${out.fine}` : "Returned on time, pushed onto the stack") : toast(out.error, true);
    await refresh(); returns();
  };
  const reshelve = async (count) => {
    const out = await api("/api/reshelve", count ? { count } : {});
    lastEvents.returns = out.events;
    toast(`${out.reshelved} book(s) popped and reshelved`);
    await refresh(); returns();
  };
  document.getElementById("r-pop").onclick = () => reshelve(1);
  document.getElementById("r-all").onclick = () => reshelve(null);
}

let memberId = "M001";
async function members() {
  const m = await api(`/api/member/${memberId}`);
  view.innerHTML = `
  <div class="card"><div class="field" style="max-width:420px;margin:0"><label>Member</label><select id="m-sel">${memberOptions()}</select></div></div>
  <div class="grid g4" style="margin-top:18px">
    ${stat("Holding now", m.holding, "out", "violet", `of ${S.rules.max_books}`)}
    ${stat("Borrowed in total", m.borrowed, "book", "blue")}
    ${stat("Late returns", m.late, "alert", "red")}
    ${stat("Fines paid", "Rs. " + m.fines, "wait", "amber")}
  </div>
  <div class="card" style="margin-top:18px"><h2>${esc(m.name)} <span class="tag gray">${m.id}</span></h2>
    <div class="sub">${esc(m.email)} · ${m.waiting.length ? "waiting for: " + m.waiting.map(esc).join(", ") : "not in any waitlist"}</div>
    <div class="table-wrap"><table><thead><tr><th>Book</th><th>Requested</th><th>Issued</th><th>Due</th><th>Returned</th><th class="num">Fine (Rs.)</th></tr></thead><tbody>
    ${m.history.map((t) => `<tr><td><b>${esc(t.title)}</b></td><td>${t.requested}</td><td>${t.issued}</td><td>${t.due}</td><td>${t.returned ?? '<span class="tag blue">holding</span>'}</td><td class="num">${t.fine ? `<span class="tag red">${t.fine}</span>` : 0}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  document.getElementById("m-sel").value = memberId;
  document.getElementById("m-sel").onchange = () => { memberId = val("m-sel"); members(); };
}

async function reports() {
  const r = await api("/api/reports");
  view.innerHTML = `
  <div class="card"><h2>Overdue on ${esc(S.clock.split(",")[0])} <span class="tag red">${r.overdue.length}</span></h2><div class="sub">Open loans past their due date, with the fine so far.</div>
    ${r.overdue.length ? `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Book</th><th>Due</th><th class="num">Days late</th><th class="num">Fine so far (Rs.)</th></tr></thead><tbody>
    ${r.overdue.map((t) => `<tr><td>${t.member_id}</td><td><b>${esc(t.title)}</b></td><td>${t.due}</td><td class="num">${t.days_late}</td><td class="num">${t.fine_so_far}</td></tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">Nothing is overdue.</div>'}</div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h2>Issues by genre</h2><div class="sub">How many times books of each genre were issued</div>${vbar(r.genres)}</div>
    <div class="card"><h2>How long books were kept</h2><div class="sub">Days between issue and return; red bars are late returns</div>${vbar(r.kept, { rotate: false, marker: r.loan_days })}</div>
  </div>
  <div class="card" style="margin-top:18px"><h2>Weekly issues and returns</h2><div class="sub">Grouped by week from the issue and return timestamps</div>
    ${lineChart(r.weekly.map((w) => w.label), [
      { name: "Books issued", color: "#3056d3", values: r.weekly.map((w) => w.issued) },
      { name: "Books returned", color: "#e08a1e", values: r.weekly.map((w) => w.returned) },
    ])}</div>`;
}

async function lab() {
  const sizes = [1000, 2000, 5000, 10000, 20000, 50000];
  const chosen = benchRows ? benchRows.map((r) => r.n) : [1000, 5000, 10000, 20000, 50000];
  view.innerHTML = `
  <div class="card"><h2>Measure the algorithms</h2><div class="sub">Builds random catalogues of each size, merge-sorts them, then times linear and binary search for the same titles.</div>
    <div class="row">${sizes.map((n) => `<label class="tag gray" style="padding:7px 10px;cursor:pointer"><input type="checkbox" value="${n}" ${chosen.includes(n) ? "checked" : ""}> n = ${fmt(n)}</label>`).join("")}
    <button class="btn" id="b-run">Run measurements</button></div></div>
  <div id="b-out" style="margin-top:18px"><div class="card"><div class="empty">Measuring…</div></div></div>`;
  const run = async () => {
    document.getElementById("b-out").innerHTML = '<div class="card"><div class="empty">Measuring…</div></div>';
    const picked = [...view.querySelectorAll("input[type=checkbox]:checked")].map((c) => Number(c.value));
    benchRows = await api("/api/bench", { sizes: picked });
    drawBench();
  };
  document.getElementById("b-run").onclick = run;
  benchRows ? drawBench() : run();
}
function drawBench() {
  const R = benchRows, n = R.map((r) => r.n), last = R[R.length - 1];
  if (!R.length) return;
  const cLog = last.binary_us / Math.log2(last.n), cNlog = last.sort_ms / (last.n * Math.log2(last.n));
  document.getElementById("b-out").innerHTML = `
  <div class="grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="card"><h2>Linear vs binary search</h2><div class="sub">Microseconds per search</div>
      ${xyChart(n, [{ name: "Linear O(n)", color: "#7a4fd6", values: R.map((r) => r.linear_us) }, { name: "Binary O(log n)", color: "#3056d3", values: R.map((r) => r.binary_us) }])}</div>
    <div class="card"><h2>Binary search follows log n</h2><div class="sub">Measured vs c · log₂ n</div>
      ${xyChart(n, [{ name: "Measured", color: "#3056d3", values: R.map((r) => r.binary_us) }, { name: "c · log₂ n", color: "#9aa5b8", dash: true, values: n.map((x) => cLog * Math.log2(x)) }])}</div>
    <div class="card"><h2>Merge sort follows n log n</h2><div class="sub">Milliseconds per sort</div>
      ${xyChart(n, [{ name: "Measured", color: "#1f9d6b", values: R.map((r) => r.sort_ms) }, { name: "c · n log₂ n", color: "#9aa5b8", dash: true, values: n.map((x) => cNlog * x * Math.log2(x)) }])}</div>
  </div>
  <div class="card" style="margin-top:18px"><h2>Measurements</h2><div class="sub">Binary search needs at most ⌊log₂ n⌋ + 1 comparisons; linear search needs up to n.</div>
    <div class="table-wrap"><table><thead><tr><th class="num">n</th><th class="num">Merge sort (ms)</th><th class="num">Linear search (µs)</th><th class="num">Binary search (µs)</th><th class="num">Binary steps (max)</th><th class="num">Binary is faster by</th></tr></thead><tbody>
    ${R.map((r) => `<tr><td class="num">${fmt(r.n)}</td><td class="num">${r.sort_ms}</td><td class="num">${r.linear_us}</td><td class="num">${r.binary_us}</td><td class="num">${r.binary_steps}</td><td class="num"><b>${fmt(Math.round(r.linear_us / r.binary_us))}×</b></td></tr>`).join("")}</tbody></table></div></div>`;
}

let logFilter = "";
async function log() {
  const rows = await api(`/api/log?q=${encodeURIComponent(logFilter)}`);
  view.innerHTML = `
  <div class="card"><form class="searchbar" id="l-form"><input id="l-q" value="${esc(logFilter)}" placeholder="Filter: a member id, a title, 'fine', 'waitlist', 'reshelved'…"><button class="btn">Filter</button></form>
    ${rows.length ? eventsHtml(rows.slice(0, 150)) : '<div class="empty" style="margin-top:12px">No events. Actions on the Issue and Returns desks appear here.</div>'}</div>`;
  document.getElementById("l-form").onsubmit = (e) => { e.preventDefault(); logFilter = val("l-q"); log(); };
}

// ------------------------------------------------------------------ router and chrome
const RENDER = { dashboard, search, issue, returns, members, reports, lab, log };
async function route() {
  const page = (location.hash.slice(1) || "dashboard").split("?")[0];
  const key = RENDER[page] ? page : "dashboard";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === key));
  document.getElementById("page-title").textContent = PAGES[key][0];
  document.getElementById("page-sub").textContent = PAGES[key][1];
  await refresh();
  await RENDER[key]();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

document.getElementById("clock-date").onchange = async (e) => {
  await api("/api/clock", { date: e.target.value });
  toast("Library date changed: new actions are time-stamped on " + e.target.value);
  route();
};
const menu = document.getElementById("menu-list");
document.getElementById("menu-btn").onclick = (e) => { e.stopPropagation(); menu.classList.toggle("open"); };
document.addEventListener("click", () => menu.classList.remove("open"));
menu.querySelectorAll("button").forEach((b) => b.onclick = async () => {
  await api(`/api/admin/${b.dataset.admin}`, {});
  Object.keys(lastEvents).forEach((k) => delete lastEvents[k]);
  toast({ save: "Saved to CSV files", reload: "Reloaded the saved library", demo: "Demo scenario restored", fresh: "Started a fresh sample library" }[b.dataset.admin]);
  route();
});

route();
