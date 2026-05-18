// discover_backward.js — OpenAlex backward citation (referenced_works) 추적
//
// 시드 논문이 *인용한* 참고문헌 = 이론 토대.
// citedBy(전방)가 "누가 발전시켰나"라면, referenced_works(후방)는 "무엇을 딛고 섰나".
//
// 사용: node _workspace/discover_backward.js
// 산출물: _workspace/discovered_backward.md

const fs = require('fs');
const path = require('path');
const oa = require('./openalex_helper');

const OUT = path.resolve(__dirname, 'discovered_backward.md');

// 시드: 위키 핵심 논문 (W-ID 또는 DOI)
const SEEDS = [
  { name: 'Guariso 2023 (SDG 예산 태깅)', wid: 'W4387120445' },
  { name: 'Matsui 2022 (일본 BERT SDG 분류기)', wid: 'W4210333430' },
  { name: 'Koh 2021 (경기도 31개 지자체 SDG 지표)', wid: 'W3202092661' },
  { name: 'Van Zanten 2021 (SDG nexus)', doi: '10.1080/13504509.2020.1768452' },
];

// 위키에 이미 있는 DOI (중복 제거)
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

async function getWid(seed) {
  if (seed.wid) return seed.wid;
  const r = await oa.verifyByDOI(seed.doi);
  return r.exists ? r.id.split('/').pop() : null;
}

(async () => {
  const found = new Map(); // dedup by id, value tracks which seeds referenced it

  for (const seed of SEEDS) {
    process.stdout.write(`\n=== ${seed.name} ===\n`);
    const wid = await getWid(seed);
    if (!wid) { console.log('  ✗ W-ID 해결 실패'); continue; }

    const work = await oa.getWork(wid);
    const refs = work.referenced_works || [];
    console.log(`  referenced_works: ${refs.length}편`);
    if (refs.length === 0) continue;

    // 배치 조회 (50개씩) — filter=openalex_id:W1|W2|...
    const batchSize = 50;
    let fetched = 0;
    for (let i = 0; i < refs.length; i += batchSize) {
      const batch = refs.slice(i, i + batchSize).map(u => u.split('/').pop());
      const filterStr = `openalex_id:${batch.join('|')}`;
      try {
        const results = await oa.filterWorks(filterStr, { maxPages: 1, perPage: batchSize });
        for (const w of results) {
          const s = shrink(w);
          fetched++;
          if (s.doi && ALREADY_IN_WIKI.has(s.doi.toLowerCase())) continue;
          if (!found.has(s.id)) {
            found.set(s.id, { ...s, viaSeeds: [seed.name] });
          } else {
            found.get(s.id).viaSeeds.push(seed.name);
          }
        }
      } catch (e) {
        console.log(`  배치 ${i}-${i + batchSize} 실패: ${e.message}`);
      }
    }
    console.log(`  → ${fetched}편 메타데이터 확보`);
  }

  // 정렬: 여러 시드가 공통 인용한 것 우선, 그다음 cited_by
  const all = [...found.values()].sort((a, b) => {
    if (b.viaSeeds.length !== a.viaSeeds.length) return b.viaSeeds.length - a.viaSeeds.length;
    return (b.cited_by || 0) - (a.cited_by || 0);
  });
  const coCited = all.filter(w => w.viaSeeds.length >= 2);
  const oaAvail = all.filter(w => w.is_oa && w.oa_url);

  let md = `# OpenAlex Backward Citation 발견 결과

> 생성: ${new Date().toISOString()}
> 시드 ${SEEDS.length}편의 referenced_works 추적 / 위키 기존 13편 제외
> 발견: 총 ${all.length}편 (★ 2+ 시드 공통인용 ${coCited.length} / OA ${oaAvail.length})

## ★ 2편 이상 시드가 공통 인용 (이론 토대 핵심 후보)

| 논문 | 연도 | cited_by | OA | 공통 인용 시드 |
|---|---:|---:|:---:|---|
`;
  for (const w of coCited) {
    const t = (w.title || '').slice(0, 65).replace(/\|/g, '/');
    const au = w.authors.join(', ').slice(0, 35);
    const oaMark = w.is_oa && w.oa_url ? `[📥](${w.oa_url})` : '🔒';
    md += `| **${t}** — ${au} | ${w.year ?? '-'} | ${w.cited_by ?? '-'} | ${oaMark} | ${w.viaSeeds.map(s => s.split(' ')[0]).join(', ')} |\n`;
  }

  md += `\n## 📥 OA 다운로드 가능 (단일 시드 인용 포함, cited_by 상위 40)\n\n| 논문 | 연도 | cited_by | OA PDF | 인용 시드 |\n|---|---:|---:|---|---|\n`;
  for (const w of oaAvail.slice(0, 40)) {
    const t = (w.title || '').slice(0, 60).replace(/\|/g, '/');
    const au = w.authors.join(', ').slice(0, 30);
    md += `| **${t}** — ${au} | ${w.year ?? '-'} | ${w.cited_by ?? '-'} | [📥](${w.oa_url}) | ${w.viaSeeds.map(s => s.split(' ')[0]).join(', ')} |\n`;
  }

  md += `\n## 🔒 paywall 상위 (cited_by 상위 30)\n\n| 논문 | 연도 | cited_by | DOI | 인용 시드 |\n|---|---:|---:|---|---|\n`;
  const paywalled = all.filter(w => !(w.is_oa && w.oa_url));
  for (const w of paywalled.slice(0, 30)) {
    const t = (w.title || '').slice(0, 55).replace(/\|/g, '/');
    md += `| ${t} | ${w.year ?? '-'} | ${w.cited_by ?? '-'} | ${w.doi || '-'} | ${w.viaSeeds.map(s => s.split(' ')[0]).join(', ')} |\n`;
  }

  md += `\n---\n\n총 ${all.length}편 발견. 전체 데이터: 이 파일.\n`;
  fs.writeFileSync(OUT, md);
  console.log(`\n📝 ${OUT}`);
  console.log(`✅ ${all.length} backward refs (${coCited.length} co-cited by 2+, ${oaAvail.length} OA)`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
