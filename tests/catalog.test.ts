import { describe, it, expect } from "vitest";
import { searchCatalog } from "../src/catalog.js";
import type { CatalogEntry } from "../src/types.js";

const sampleEntries: CatalogEntry[] = [
  {
    source: {
      id: "estat",
      name: "e-Stat (政府統計の総合窓口)",
      url: "https://www.e-stat.go.jp/",
      description: "日本の政府統計を横断的に検索・閲覧できるポータルサイト",
      provider: "総務省統計局",
      category: "government",
      formats: ["csv", "json", "xml"],
    },
    datasets: [
      {
        id: "population_census",
        name: "国勢調査 人口等基本集計",
        description: "5年ごとの全数調査による日本の人口・世帯の基本統計",
        tags: ["人口", "世帯", "国勢調査", "都道府県", "市区町村"],
        url: "https://www.e-stat.go.jp/stat-search/files?toukei=00200521",
        last_confirmed: "2026-03-10",
        access_method: "api",
        notes: "appIdが必要",
      },
      {
        id: "cpi",
        name: "消費者物価指数",
        description: "全国の消費者物価指数（月次）",
        tags: ["物価", "CPI", "消費者物価", "経済指標", "月次"],
        url: "https://www.e-stat.go.jp/stat-search/files?toukei=00200573",
        last_confirmed: "2026-03-10",
        access_method: "api",
      },
    ],
  },
  {
    source: {
      id: "worldbank",
      name: "World Bank Open Data",
      url: "https://data.worldbank.org/",
      description: "世界銀行が提供する各国の経済・社会指標データ",
      provider: "World Bank",
      category: "international",
      formats: ["csv", "json", "xml"],
    },
    datasets: [
      {
        id: "gdp",
        name: "GDP (current US$)",
        description: "各国のGDP（名目、USドル）",
        tags: ["GDP", "経済", "国際比較", "年次"],
        url: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
        last_confirmed: "2026-03-10",
        access_method: "api",
      },
    ],
  },
];

describe("searchCatalog", () => {
  it("タグで検索できる", () => {
    const results = searchCatalog(sampleEntries, "人口");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dataset.id).toBe("population_census");
  });

  it("名前で検索できる", () => {
    const results = searchCatalog(sampleEntries, "消費者物価");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dataset.id).toBe("cpi");
  });

  it("英語タグで検索できる", () => {
    const results = searchCatalog(sampleEntries, "GDP");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dataset.id).toBe("gdp");
  });

  it("複数キーワードで検索できる", () => {
    const results = searchCatalog(sampleEntries, "人口 都道府県");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dataset.id).toBe("population_census");
  });

  it("該当なしの場合は空配列を返す", () => {
    const results = searchCatalog(sampleEntries, "存在しないデータ");
    expect(results.length).toBe(0);
  });

  it("空クエリは空配列を返す", () => {
    const results = searchCatalog(sampleEntries, "");
    expect(results.length).toBe(0);
  });

  it("スコア順にソートされる", () => {
    const results = searchCatalog(sampleEntries, "経済");
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });
});
