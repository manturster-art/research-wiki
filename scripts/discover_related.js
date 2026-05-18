// discover_related.js — OpenAlex로 위키 관련 논문 발견
//
// (1) 핵심 3편을 인용한 후속 논문 (forward citation, citedBy)
// (2) 주제 키워드 검색 (searchWorks)
// 결과를 dedup + 2018+ 필터 + OA URL 표시하여 보고.
//
// 사용: node _workspace/discover_related.js
// 산출물: _workspace/discovered_related.md

const fs = require('fs');
const path = require('path');
const oa = require('./openalex_helper');

const OUT = path.resolve(__dirname, 'discovered_related.md');

// 위키 핵심 3편 (이미 등재됨) — 이들을 인용한 후속 논문 추적
const SEEDS = [
  { wid: 'W4387120445', name: 'Guariso 2023 (SDG 예산 태깅)' },
  { wid: 'W4210333430', name: 'Matsui 2022 (일본 BERT SDG 분류기)' },
  { wid: 'W3202092661', name: 'Koh 2021 (경기도 31개 지자체 SDG 지표)' },
];

// 주제 키워드 검색 (본 박사연구 4대 축)
const QUERIES = [
  'SDG budget tagging local government',
  'sustainable development goals classification Korea',
  'SDG localization municipal budget',
  'political determinants local environmental budget',
];

// 위키에 이미 있는 것 (중복 제거용) — DOI 소문자
const ALREADY_IN_WIKI = new Set([
  '10.1017/dap.2023.28', '10.1007/s11625-022-01093-3', '10.1080/20964129.2021.1980437',
  '10.1093/pan/mps028', '10.1080/13504509.2020.1768452', '10.1038/s41558-020-0831-z',
  '10.1017/pan.2020.33', '10.1016/j.jeconom.2020.12.001', '10.1257/aer.20181169',
  '10.1162/003355304772839588', '10.4491/ksee.2022.44.3.64', '10.1080/19312458.2011.568376',
  '10.3390/su11041116',
]);

function shrink(w) {
  return {
    id: w.id,
    title: w.display_name || w.title,
    year: w.publication_year,
    doi: w.doi ? w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null,
    cited_by: w.cited_by_count,
    type: w.type,
    source: w.primary_location?.source?.display_name || null,
    is_oa: w.open_access?.is_oa || false,
    oa_url: w.open_access?.oa_url || null,
    authors: (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean),
  };
}

(async () => {
  const found = new Map(); // dedup by OpenAlex id

  // (1) Forward citations
  console.log('=== Forward citations (citedBy) ===');
  for (const seed of SEEDS) {
    process.stdout.write(`  ${seed.name}  `);
    try {
      const citers = await oa.citedBy(seed.wid, { maxPages: 2, perPage: 100 });
      let added = 0;
      for (const w of citers) {
        const s = shrink(w);
        if (s.year && s.year < 2018) continue;
        if (s.doi && ALREADY_IN_WIKI.has(s.doi.toLowerCase())) continue;
        if (!found.has(s.id)) { found.set(s.id, { ...s, via: `cited ${seed.name}` }); added++; }
      }
      console.log(`→ ${citers.length} citers, ${added} new`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }

  // (2) Keyword searches
  console.log('\n=== Keyword searches ===');
  for (const q of QUERIES) {
    process.stdout.write(`  "${q}"  `);
    try {
      const results = await oa.searchWorks(q, { maxPages: 1, perPage: 25 });
      let added = 0;
      for (const w of results) {
        const s = shrink(w);
        if (s.year && s.year < 2018) continue;
        if (s.doi && ALREADY_IN_WIKI.has(s.doi.toLowerCase())) continue;
        if (!found.has(s.id)) { found.set(s.id, { ...s, via: `search: ${q}` }); added++; }
        else { found.get(s.id).via += ` + search`; }
      }
      console.log(`→ ${results.length} hits, ${added} new`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }

  // ─── 정렬: cited_by 내림차순, 그 안에서 최신순 ───
  const all = [...found.values()].sort((a, b) => (b.cited_by || 0) - (a.cited_by || 0) || (b.year || 0) - (a.year || 0));
  const oaAvail = all.filter(w => w.is_oa && w.oa_url);
  const paywalled = all.filter(w => !(w.is_oa && w.oa_url));

  // ─── 보고서 ───
  let md = `# OpenAlex 관련 논문 발견 결과

> 생성: ${new Date().toISOString()}
> 시드 3편 forward citation + 키워드 4종 검색 / 2018+ 필터 / 위키 기존 13편 제외
> 발견: 총 ${all.length}편 (OA 다운로드 가능 ${oaAvail.length} / paywall ${paywalled.length})

## 📥 OA 다운로드 가능 (즉시 위키 등재 후보)

| 논문 | 연도 | cited_by | OA PDF | 발견 경로 |
|---|---:|---:|---|---|
`;
  for (const w of oaAvail.slice(0, 40)) {
    const t = (w.title || '').slice(0, 70).replace(/\|/g, '/');
    const au = w.authors.join(', ').slice(0, 40);
    md += `| **${t}** — ${au} | ${w.year ?? '-'} | ${w.cited_by ?? '-'} | [📥](${w.oa_url}) | ${w.via} |\n`;
  }

  md += `\n## 🔒 paywall (DOI만, 도서관 입수)\n\n| 논문 | 연도 | cited_by | DOI | source | 발견 경로 |\n|---|---:|---:|---|---|---|\n`;
  for (const w of paywalled.slice(0, 40)) {
    const t = (w.title || '').slice(0, 60).replace(/\|/g, '/');
    md += `| ${t} | ${w.year ?? '-'} | ${w.cited_by ?? '-'} | ${w.doi || '-'} | ${(w.source || '-').slice(0,30)} | ${w.via} |\n`;
  }

  md += `\n---\n\n## 다음 단계\n\n1. 위 OA 목록에서 박사연구에 쓸 논문 선택\n2. \`node _workspace/openalex_helper.js doi <DOI>\` 로 단건 재검증\n3. OA PDF는 \`papers/\`로 다운로드 → \`sources/\` + \`wiki/\` 작성\n4. paywall은 도서관 입수\n`;

  fs.writeFileSync(OUT, md);
  console.log(`\n📝 ${OUT}`);
  console.log(`✅ ${all.length} related works found (${oaAvail.length} OA, ${paywalled.length} paywalled)`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
