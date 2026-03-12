const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let catalog = null;
let activeCategory = "all";
let searchQuery = "";

const categoryColors = {
  government: "var(--gov)",
  international: "var(--int)",
  academic: "var(--aca)",
  private: "var(--pri)",
};

async function init() {
  const res = await fetch("catalog.json");
  catalog = await res.json();
  render();
  renderFooter();
  bindEvents();
}

function getFilteredSources() {
  const q = searchQuery.toLowerCase();
  const results = [];

  for (const source of catalog.sources) {
    if (activeCategory !== "all" && source.category !== activeCategory) continue;

    const matchedDatasets = source.datasets.filter((d) => {
      if (!q) return true;
      const hay = [d.name, d.description, d.tags.join(" "), source.name, source.provider]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    if (matchedDatasets.length > 0) {
      results.push({ source, datasets: matchedDatasets });
    }
  }
  return results;
}

function render() {
  const groups = getFilteredSources();
  const listing = $("#listing");
  const status = $("#status");

  const totalDatasets = groups.reduce((n, g) => n + g.datasets.length, 0);
  status.textContent = `${groups.length} sources / ${totalDatasets} datasets`;

  if (groups.length === 0) {
    listing.innerHTML = `
      <div class="empty">
        <p class="empty-heading">該当するデータセットが見つかりません</p>
        <p>検索キーワードを変えるか、フィルタを解除してください</p>
        <button class="empty-action" id="reset-btn">フィルタをリセット</button>
      </div>`;
    const resetBtn = $("#reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        searchQuery = "";
        activeCategory = "all";
        $("#search").value = "";
        $$(".filter").forEach((b) => b.classList.remove("active"));
        $(".filter[data-category='all']").classList.add("active");
        render();
      });
    }
    return;
  }

  listing.innerHTML = groups.map(({ source, datasets }) => sourceGroupHTML(source, datasets)).join("");
}

function sourceGroupHTML(source, datasets) {
  const color = categoryColors[source.category] || "var(--text2)";
  const metaParts = [];
  if (source.url) metaParts.push(`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.url)}</a>`);
  if (source.formats.length) metaParts.push(source.formats.map(esc).join(", "));
  if (source.api?.available) metaParts.push("API対応");

  return `
    <section class="source-group">
      <div class="source-header">
        <span class="source-dot" style="background:${color}"></span>
        <span class="source-name">${esc(source.name)}</span>
        <span class="source-provider">${esc(source.provider)}</span>
      </div>
      <div class="source-meta">${metaParts.join(" · ")}</div>
      ${datasets.map((d) => datasetHTML(d, source)).join("")}
    </section>`;
}

function datasetHTML(dataset, source) {
  const tags = dataset.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");

  const fields = [];
  fields.push(["URL", `<a href="${esc(dataset.url)}" target="_blank" rel="noopener">${esc(dataset.url)}</a>`]);
  fields.push(["アクセス", esc(dataset.access_method)]);
  if (dataset.update_frequency) fields.push(["更新頻度", esc(dataset.update_frequency)]);
  fields.push(["最終確認", esc(dataset.last_confirmed)]);
  if (dataset.notes) fields.push(["備考", esc(dataset.notes)]);

  const dl = fields.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  return `
    <details class="dataset">
      <summary class="dataset-summary">
        <div class="dataset-summary-text">
          <span class="dataset-title">${esc(dataset.name)}</span>
          <span class="dataset-desc">${esc(dataset.description)}</span>
        </div>
        <span class="dataset-method">${esc(dataset.access_method)}</span>
        <span class="dataset-arrow">&#9654;</span>
      </summary>
      <div class="dataset-detail">
        <div class="dataset-tags">${tags}</div>
        <dl class="dataset-fields">${dl}</dl>
      </div>
    </details>`;
}

function renderFooter() {
  const s = catalog.stats;
  const cats = Object.entries(s.byCategory)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  $("#footer").innerHTML = `
    <span>${s.totalSources} sources, ${s.totalDatasets} datasets (${cats})</span>
    <span>Generated ${catalog.generatedAt.split("T")[0]}</span>`;
}

function bindEvents() {
  $("#search").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    render();
  });

  for (const btn of $$(".filter")) {
    btn.addEventListener("click", () => {
      $$(".filter").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.category;
      render();
    });
  }
}

function esc(str) {
  if (typeof str !== "string") return String(str ?? "");
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

init();
