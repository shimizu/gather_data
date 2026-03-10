import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { searchCatalog, registerEntry, getCatalogStats, getSourceDetail } from "../src/catalog.js";
import { initDb, closeDb } from "../src/db.js";
import type { CatalogEntry } from "../src/types.js";

const sampleEntry: CatalogEntry = {
  source: {
    id: "test_source",
    name: "テストデータソース",
    url: "https://example.com",
    description: "テスト用のデータソース",
    provider: "テスト組織",
    category: "government",
    formats: ["csv", "json"],
  },
  datasets: [
    {
      id: "population",
      name: "人口統計データ",
      description: "都道府県別の人口統計",
      tags: ["人口", "都道府県", "統計"],
      url: "https://example.com/population",
      last_confirmed: "2026-03-10",
      access_method: "api",
      notes: "テスト用",
    },
    {
      id: "gdp",
      name: "GDP統計",
      description: "国内総生産のデータ",
      tags: ["GDP", "経済", "国内総生産"],
      url: "https://example.com/gdp",
      last_confirmed: "2026-03-10",
      access_method: "download",
    },
  ],
};

beforeAll(() => {
  // テスト用にインメモリDBを使用 (YAML書き出しなし)
  initDb(":memory:");
  registerEntry(sampleEntry, { skipYaml: true });
});

afterAll(() => {
  closeDb();
});

describe("searchCatalog (FTS5)", () => {
  it("タグで検索できる", () => {
    const results = searchCatalog("人口");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.dataset.id === "population")).toBe(true);
  });

  it("名前で検索できる", () => {
    const results = searchCatalog("GDP");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.dataset.id === "gdp")).toBe(true);
  });

  it("説明文で検索できる", () => {
    const results = searchCatalog("都道府県");
    expect(results.length).toBeGreaterThan(0);
  });

  it("該当なしの場合は空配列を返す", () => {
    const results = searchCatalog("zzzznotfound");
    expect(results.length).toBe(0);
  });

  it("空クエリは空配列を返す", () => {
    const results = searchCatalog("");
    expect(results.length).toBe(0);
  });

  it("limitで件数を制限できる", () => {
    const results = searchCatalog("人口 OR GDP", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe("getCatalogStats", () => {
  it("統計情報を返す", () => {
    const stats = getCatalogStats();
    expect(stats.sources).toBeGreaterThanOrEqual(1);
    expect(stats.datasets).toBeGreaterThanOrEqual(2);
    expect(stats.categories).toHaveProperty("government");
  });
});

describe("registerEntry (更新)", () => {
  it("既存データセットの更新がFTS検索に反映される", () => {
    const updatedEntry: CatalogEntry = {
      source: { ...sampleEntry.source },
      datasets: [
        {
          id: "population",
          name: "更新された人口データ",
          description: "全国の最新人口統計",
          tags: ["人口", "全国", "最新"],
          url: "https://example.com/population-v2",
          last_confirmed: "2026-03-10",
          access_method: "api",
        },
      ],
    };
    registerEntry(updatedEntry, { skipYaml: true });

    // 新しいタグで検索できる (FTS が更新されている証拠)
    const tagResults = searchCatalog("最新");
    expect(tagResults.length).toBeGreaterThan(0);
    expect(tagResults[0].dataset.id).toBe("population");
    expect(tagResults[0].dataset.name).toBe("更新された人口データ");

    // 更新後の説明で検索できる
    const descResults = searchCatalog("全国");
    expect(descResults.length).toBeGreaterThan(0);
    expect(descResults[0].dataset.id).toBe("population");
  });

  it("カテゴリ変更後もソースが重複しない", () => {
    const changedCategory: CatalogEntry = {
      source: {
        ...sampleEntry.source,
        category: "international",
      },
      datasets: sampleEntry.datasets,
    };
    registerEntry(changedCategory, { skipYaml: true });

    // SQLite 上でソースが1件のみであること
    const stats = getCatalogStats();
    expect(stats.sources).toBe(1);
    expect(stats.categories).toHaveProperty("international");
    expect(stats.categories).not.toHaveProperty("government");

    // 元に戻す
    registerEntry(sampleEntry, { skipYaml: true });
  });

  it("既存ソース情報の更新が反映される", () => {
    const updatedEntry: CatalogEntry = {
      source: {
        ...sampleEntry.source,
        name: "更新されたソース名",
        description: "更新された説明",
      },
      datasets: sampleEntry.datasets,
    };
    registerEntry(updatedEntry, { skipYaml: true });

    const detail = getSourceDetail("test_source");
    expect(detail).not.toBeNull();
    expect(detail!.source.name).toBe("更新されたソース名");
    expect(detail!.source.description).toBe("更新された説明");
  });
});

describe("getSourceDetail", () => {
  it("ソースの詳細を取得できる", () => {
    // 前のテストで更新されている場合があるので、再登録して確認
    registerEntry(sampleEntry, { skipYaml: true });
    const detail = getSourceDetail("test_source");
    expect(detail).not.toBeNull();
    expect(detail!.source.name).toBe("テストデータソース");
    expect(detail!.datasets.length).toBe(2);
  });

  it("存在しないソースはnullを返す", () => {
    const detail = getSourceDetail("nonexistent");
    expect(detail).toBeNull();
  });
});
