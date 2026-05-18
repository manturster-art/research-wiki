// reverify_shortlist.js — 큐레이션된 12편 OA 재검증
// 각 DOI를 verifyByDOI로 전체 레코드 조회 → OA 미러 URL 확인
// 산출물: _workspace/shortlist_reverified.md

const fs = require('fs');
const path = require('path');
const oa = require('./openalex_helper');

const OUT = path.resolve(__dirname, 'shortlist_reverified.md');

const SHORTLIST = [
  // Paper 1 관련
  { name: 'SDG-Meter: A Deep Learning Based Tool for Automatic Text Classification of the Sustainable Development Goals', doi: '10.1007/978-3-031-21743-2_21', tier: 'P1', note: 'paper1 A-5, 8개 모델 비교 보강 / Guisiano, Chiky & de Mello' },
  { name: 'A generalized LLMs framework to support public health finance', doi: '10.1016/j.artmed.2025.103203', tier: 'P1', note: 'LLM + 공공재정' },
  { name: "Classification of UN's SDGs Using BERT", doi: '10.1007/978-3-032-12879-9_24', tier: 'P1', note: 'SDG BERT 분류 최신' },
  { name: 'Automated Extraction from Financial documents', doi: '10.1007/s13369-026-11157-6', tier: 'P1', note: '재정 문서 자동 추출' },
  { name: 'Multidimensional Model for Social Tagging of Environmental Info', doi: '10.1007/978-3-032-09271-7_9', tier: 'P1', note: '환경 정보 태깅 모델' },
  // Paper 2 관련
  { name: 'Environment and political economics: Left-wing liberalism', doi: '10.1016/j.scitotenv.2020.140779', tier: 'P2', note: '★★ political-institutional 카테고리 직격' },
  { name: 'The Role of Local Governments in Localizing and Implementing SDGs', doi: '10.71064/spu.amjr.1.1.209', tier: 'P2', note: '지방정부 SDG 지방화' },
  { name: 'Differentiated impacts of environmental contexts on residents', doi: '10.1016/j.jenvman.2024.120617', tier: 'P2', note: 'J. Environmental Management' },
  { name: 'Trade-offs between sustainability and viability: Analysing cities', doi: '10.1016/j.cities.2025.106368', tier: 'P2', note: 'Cities, trade-off/nexus' },
  { name: 'Benchmarking and non-financial disclosure (large orgs)', doi: '10.1080/01442872.2025.2560676', tier: 'P2', note: 'Policy Studies' },
  // 예산 태깅
  { name: 'Wellbeing gender budgeting to localize the UN SDGs', doi: '10.1080/09540962.2021.1965402', tier: 'BUDGET', note: '★★ 성인지예산 + SDG 지방화' },
  // Government budget and the SDGs — DOI 없음, title 검색
  { name: 'Government budget and the Sustainable Development Goals', doi: null, title: 'Government budget and the Sustainable Development Goals', year: 2020, tier: 'BUDGET', note: 'RePEc 워킹페이퍼' },
];

(async () => {
  console.log(`🔍 Re-verifying ${SHORTLIST.length} shortlisted papers...\n`);
  const results = [];
  for (let i = 0; i < SHORTLIST.length; i++) {
    const item = SHORTLIST[i];
    process.stdout.write(`[${i + 1}/${SHORTLIST.length}] ${item.name.slice(0, 50)}  `);
    let r;
    try {
      if (item.doi) {
        r = await oa.verifyByDOI(item.doi);
      } else {
        const t = await oa.verifyByTitle(item.title, item.year);
        r = t.best ? { exists: t.exists, confidence: t.confidence, ...t.best } : { exists: false, error: 'no match' };
      }
    } catch (e) {
      r = { exists: false, error: e.message };
    }
    const status = r.exists ? (r.is_oa && r.oa_url ? '✓ OA' : '✓ paywall') : '✗';
    console.log(`${status}${r.cited_by_count != null ? ' (' + r.cited_by_count + ' cites)' : ''}`);
    results.push({ ...item, oa: r });
  }

  const oaAvail = results.filter(r => r.oa.exists && r.oa.is_oa && r.oa.oa_url);
  const paywalled = results.filter(r => r.oa.exists && !(r.oa.is_oa && r.oa.oa_url));
  const notFound = results.filter(r => !r.oa.exists);

  let md = `# 큐레이션 12편 — OA 재검증 결과

> 생성: ${new Date().toISOString()}
> ${results.length}편 재검증 / OA ${oaAvail.length} / paywall ${paywalled.length} / 미발견 ${notFound.length}

## 📥 OA 다운로드 가능 → 즉시 위키 등재 후보

| tier | 논문 | 연도 | cites | OA PDF | 비고 |
|---|---|---:|---:|---|---|
`;
  for (const r of oaAvail) {
    md += `| ${r.tier} | **${r.name}** | ${r.oa.year ?? '-'} | ${r.oa.cited_by_count ?? '-'} | [📥](${r.oa.oa_url}) | ${r.note} |\n`;
  }

  md += `\n## 🔒 paywall — 도서관 입수\n\n| tier | 논문 | 연도 | cites | DOI | source | 비고 |\n|---|---|---:|---:|---|---|---|\n`;
  for (const r of paywalled) {
    md += `| ${r.tier} | ${r.name} | ${r.oa.year ?? '-'} | ${r.oa.cited_by_count ?? '-'} | ${r.oa.doi || '-'} | ${(r.oa.source || '-').slice(0,28)} | ${r.note} |\n`;
  }

  if (notFound.length) {
    md += `\n## ✗ OpenAlex 미발견\n\n| tier | 논문 | 사유 |\n|---|---|---|\n`;
    for (const r of notFound) md += `| ${r.tier} | ${r.name} | ${r.oa.error || 'no match'} |\n`;
  }

  fs.writeFileSync(OUT, md);
  console.log(`\n📝 ${OUT}`);
  console.log(`✅ OA: ${oaAvail.length} / paywall: ${paywalled.length} / not found: ${notFound.length}`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
