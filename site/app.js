// Browsable view of ideas.json (built from GitHub issues by scripts/build-data.mjs).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const DAY = 86400000;

  let data = null;
  let lastFocus = null;
  const state = { q: "", sort: "new", status: new Set(), mentorship: new Set(), area: new Set(), size: new Set() };

  // ---------------------------------------------------------------- loading
  async function load() {
    if (window.__IDEAS__) { data = window.__IDEAS__; init(); return; }
    const sample = new URLSearchParams(location.search).has("sample");
    try {
      data = await fetchJson(sample ? "sample-ideas.json" : "ideas.json");
      if (!sample && data.ideas.length === 0 && (location.hostname === "localhost" || location.protocol === "file:")) {
        data = await fetchJson("sample-ideas.json");
        data.isSample = true;
      }
      if (sample) data.isSample = true;
    } catch {
      try {
        data = await fetchJson("sample-ideas.json");
        data.isSample = true;
      } catch {
        $("list").innerHTML = `<li class="empty"><strong>Couldn't load the ideas.</strong>The site data is rebuilt by the "Site" workflow. Check that it has run in the repository's Actions tab.</li>`;
        return;
      }
    }
    init();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  // ------------------------------------------------------------------ setup
  function init() {
    const repoUrl = `https://github.com/${data.repo}`;
    $("post-link").href = `${repoUrl}/issues/new?template=idea.yml`;
    $("repo-link").href = repoUrl;
    $("updated").textContent = relTime(data.generatedAt);
    $("sample-note").hidden = !data.isSample;
    if (data.siteTitle) {
      $("site-title").textContent = data.siteTitle;
      document.title = data.siteTitle;
    }

    readUrl();
    $("q").value = state.q;
    $("sort").value = state.sort;

    $("q").addEventListener("input", (e) => { state.q = e.target.value; update(); });
    $("sort").addEventListener("change", (e) => { state.sort = e.target.value; update(); });
    $("how-btn").addEventListener("click", (e) => {
      const open = e.currentTarget.getAttribute("aria-expanded") !== "true";
      e.currentTarget.setAttribute("aria-expanded", open);
      $("how").hidden = !open;
    });
    $("filters-toggle").addEventListener("click", (e) => {
      const open = e.currentTarget.getAttribute("aria-expanded") !== "true";
      e.currentTarget.setAttribute("aria-expanded", open);
      $("facets").classList.toggle("open", open);
    });
    $("scrim").addEventListener("click", closeDetail);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("detail").hidden) closeDetail();
      if (e.key === "Tab" && !$("detail").hidden) trapFocus(e);
    });
    window.addEventListener("hashchange", route);

    update();
    route();
  }

  // ------------------------------------------------------------ derived data
  function status(idea) {
    if (idea.claims.length === 0) return { key: "free", text: "Available" };
    if (idea.claimMode === "exclusive") return { key: "taken", text: `Taken by @${idea.claims[0].user}` };
    const solo = idea.claims.every((c) => c.mode === "solo");
    const n = idea.claims.length;
    return { key: "busy", text: `${n} ${n === 1 ? "person" : "people"} on it${solo ? "" : ", open to collaborators"}` };
  }
  const statusFacet = (idea) => (idea.claims.length === 0 ? "free" : idea.claimMode === "exclusive" ? "taken" : "busy");
  const lastActive = (idea) => Math.max(Date.parse(idea.updatedAt), ...idea.claims.map((c) => Date.parse(c.renewedAt)));

  const FACETS = [
    { key: "status", title: "Status", value: statusFacet, labels: () => ({ free: "Available", busy: "In progress, can join", taken: "Taken" }) },
    { key: "mentorship", title: "Mentorship", value: (i) => i.mentorship, labels: () => data.meta.mentorship },
    { key: "size", title: "Size", value: (i) => i.size, labels: () => data.meta.sizes },
    { key: "area", title: "Area", value: (i) => i.area, labels: () => data.meta.areas },
  ];

  function matches(idea, skipFacet) {
    for (const f of FACETS) {
      if (f.key === skipFacet) continue;
      const sel = state[f.key];
      if (sel.size && !sel.has(f.value(idea))) return false;
    }
    if (state.q.trim()) {
      const hay = [idea.title, idea.summary, idea.description, idea.prerequisites, idea.author, data.meta.areas[idea.area]].join(" ").toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function sorted(list) {
    const order = data.meta.sizeOrder;
    const by = {
      new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      active: (a, b) => lastActive(b) - lastActive(a),
      small: (a, b) => order.indexOf(a.size) - order.indexOf(b.size) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
    }[state.sort];
    return [...list].sort(by);
  }

  // ---------------------------------------------------------------- render
  function update() {
    writeUrl();
    renderFacets();
    const shown = sorted(data.ideas.filter((i) => matches(i)));
    const total = data.ideas.length;
    $("count").textContent = shown.length === total ? `${total} idea${total === 1 ? "" : "s"}` : `${shown.length} of ${total} ideas`;
    $("list").innerHTML = shown.length ? shown.map(row).join("") : emptyState(total);
    const reset = $("list").querySelector("[data-clear]");
    if (reset) reset.addEventListener("click", clearAll);
  }

  function emptyState(total) {
    if (total === 0)
      return `<li class="empty"><strong>No ideas yet.</strong>Be the first: <a href="${esc($("post-link").href)}">post an idea</a>.</li>`;
    return `<li class="empty"><strong>Nothing matches those filters.</strong><button class="clear" type="button" data-clear>Clear filters</button></li>`;
  }

  function mentorTag(m) {
    const label = esc(data.meta.mentorship[m] || "");
    if (m === "mentor") return `<span class="mark">${label}</span>`;
    if (m === "async") return `<span class="mark soft">${label}</span>`;
    return `<span>${label}</span>`;
  }

  function row(idea) {
    const s = status(idea);
    const result = idea.results.length ? `<span class="result-flag">${idea.results.length} result${idea.results.length > 1 ? "s" : ""} posted</span>` : "";
    return `<li class="item"><a href="#idea-${idea.number}" data-n="${idea.number}">
      <h3 class="title">${esc(idea.title)}</h3>
      ${idea.summary ? `<p class="summary">${esc(idea.summary)}</p>` : ""}
      <div class="tags">
        ${mentorTag(idea.mentorship)}
        <span>${esc(data.meta.areas[idea.area] || "")}</span>
        ${idea.size ? `<span>${esc(data.meta.sizes[idea.size])}</span>` : ""}
        <span>@${esc(idea.author)}</span>
      </div>
      <span class="status s-${s.key}"><span class="dot" aria-hidden="true"></span>${esc(s.text)}${result}</span>
    </a></li>`;
  }

  function renderFacets() {
    const html = FACETS.map((f) => {
      const labels = f.labels();
      // Counts reflect the other active filters, so users see what each choice would give.
      const counts = {};
      for (const i of data.ideas) if (matches(i, f.key)) counts[f.value(i)] = (counts[f.value(i)] || 0) + 1;
      const keys = Object.keys(labels).filter((k) => counts[k] || state[f.key].has(k));
      if (!keys.length) return "";
      return `<fieldset class="facet" style="border:0;padding:0;margin:0"><legend class="visually-hidden">${f.title}</legend><h2 aria-hidden="true">${f.title}</h2><ul>${keys
        .map((k) => `<li><label><input type="checkbox" data-facet="${f.key}" value="${esc(k)}" ${state[f.key].has(k) ? "checked" : ""}>${esc(labels[k])}<span class="n">${counts[k] || 0}</span></label></li>`)
        .join("")}</ul></fieldset>`;
    }).join("");
    const any = FACETS.some((f) => state[f.key].size);
    const focused = document.activeElement?.matches?.("[data-facet]") ? `${document.activeElement.dataset.facet}:${document.activeElement.value}` : null;
    $("facets").innerHTML = html + (any ? `<button class="clear" type="button" id="clear">Clear filters</button>` : "");
    $("facets").querySelectorAll("[data-facet]").forEach((el) =>
      el.addEventListener("change", () => {
        const set = state[el.dataset.facet];
        el.checked ? set.add(el.value) : set.delete(el.value);
        update();
      })
    );
    if (focused) $("facets").querySelector(`[data-facet="${focused.split(":")[0]}"][value="${CSS.escape(focused.split(":").slice(1).join(":"))}"]`)?.focus();
    $("clear")?.addEventListener("click", clearAll);
  }

  function clearAll() {
    FACETS.forEach((f) => state[f.key].clear());
    state.q = "";
    $("q").value = "";
    update();
  }

  // ---------------------------------------------------------------- detail
  function route() {
    const m = location.hash.match(/^#idea-(\d+)$/);
    const idea = m && data.ideas.find((i) => i.number === Number(m[1]));
    if (idea) openDetail(idea);
    else if (!$("detail").hidden) hideDetail();
  }

  function md(text) {
    if (!text) return "";
    if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text));
    return `<p>${esc(text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  }

  function openDetail(idea) {
    if ($("detail").hidden) lastFocus = document.activeElement;
    const s = status(idea);
    const rules = data.meta.claimRules;
    const people = idea.claims.length
      ? `<h3>Who's working on it</h3><ul class="people">${idea.claims
          .map((c) => `<li><a href="https://github.com/${esc(c.user)}">@${esc(c.user)}</a> ${c.mode === "solo" ? "(working solo)" : "(open to collaborators)"}, since ${fmtDate(c.since)}${c.note ? `<br><span class="note">Latest: ${esc(c.note)} (${relTime(c.renewedAt)})</span>` : ""}</li>`)
          .join("")}</ul>`
      : "";
    const results = idea.results.length
      ? `<h3>Results</h3><ul class="people">${idea.results
          .map((r) => `<li>@${esc(r.user)}, ${fmtDate(r.at)}${r.link ? `: ${linkify(r.link)}` : ""}</li>`)
          .join("")}</ul>`
      : "";

    let cta;
    if (s.key === "taken") {
      cta = `<p>This idea is exclusive and currently claimed. If the claim isn't renewed it becomes available again; you can also ask on the issue whether they'd like a collaborator.</p><a class="btn" href="${esc(idea.url)}">Open on GitHub</a>`;
    } else {
      cta = `<p>To take this on, open the issue and comment <code>/claim</code> (or <code>/claim solo</code>). You'll renew with <code>/renew</code> every ${rules.renewAfterDays} days.${idea.mentorship === "mentor" ? ` @${esc(idea.author)} has offered to mentor, so say hello in your comment.` : idea.mentorship === "async" ? ` @${esc(idea.author)} can review a draft when you have one.` : ""}</p><a class="btn primary" href="${esc(idea.url)}">Claim on GitHub</a>`;
    }

    const d = $("detail");
    d.innerHTML = `
      <button class="btn close" type="button" id="close">Close</button>
      <h2 id="detail-title">${esc(idea.title)}</h2>
      <p class="by">${idea.avatar ? `<img src="${esc(idea.avatar)}&s=44" alt="">` : ""}Posted by <a href="https://github.com/${esc(idea.author)}">@${esc(idea.author)}</a> on ${fmtDate(idea.createdAt)}</p>
      <dl class="facts">
        <dt>Status</dt><dd class="s-${s.key}"><span class="dot" aria-hidden="true"></span>${esc(s.text)}</dd>
        <dt>Mentorship</dt><dd>${mentorTag(idea.mentorship)}</dd>
        <dt>Area</dt><dd>${esc(data.meta.areas[idea.area] || "")}</dd>
        ${idea.size ? `<dt>Size</dt><dd>${esc(data.meta.sizes[idea.size])}</dd>` : ""}
        ${idea.prerequisites ? `<dt>Background</dt><dd>${esc(idea.prerequisites)}</dd>` : ""}
      </dl>
      <div class="prose">
        ${idea.summary ? `<p><strong>${esc(idea.summary)}</strong></p>` : ""}
        ${md(idea.description)}
        ${idea.firstSteps ? `<h3>Suggested first steps</h3>${md(idea.firstSteps)}` : ""}
        ${idea.links ? `<h3>Related work</h3>${md(idea.links)}` : ""}
        ${people}${results}
      </div>
      <div class="cta">${cta}</div>`;
    d.querySelectorAll(".prose a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    $("close").addEventListener("click", closeDetail);
    const wasHidden = d.hidden;
    d.hidden = false;
    $("scrim").hidden = false;
    document.body.style.overflow = "hidden";
    if (wasHidden) { d.classList.remove("opening"); void d.offsetWidth; d.classList.add("opening"); }
    d.scrollTop = 0;
    d.focus();
  }

  function closeDetail() {
    if (location.hash) history.pushState("", document.title, location.pathname + location.search);
    hideDetail();
  }
  function hideDetail() {
    $("detail").hidden = true;
    $("scrim").hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
  function trapFocus(e) {
    const f = [...$("detail").querySelectorAll("a[href], button, [tabindex]:not([tabindex='-1'])")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $("detail"))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ------------------------------------------------------------- url state
  function readUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    state.sort = p.get("sort") || "new";
    for (const f of FACETS) state[f.key] = new Set((p.get(f.key) || "").split(",").filter(Boolean));
  }
  function writeUrl() {
    const p = new URLSearchParams(location.search);
    const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
    set("q", state.q.trim());
    set("sort", state.sort === "new" ? "" : state.sort);
    for (const f of FACETS) set(f.key, [...state[f.key]].join(","));
    const qs = p.toString().replace(/%2C/g, ",");
    try { history.replaceState(null, "", `${location.pathname}${qs ? "?" + qs : ""}${location.hash}`); } catch {}
  }

  // ----------------------------------------------------------------- utils
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function relTime(iso) {
    const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 60) return `${days} days ago`;
    return fmtDate(iso);
  }
  function linkify(s) {
    return /^https?:\/\/\S+$/.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>` : esc(s);
  }

  load();
})();
