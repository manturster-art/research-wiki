// find_missing_pdfs.js — 우선순위 미입수 PDF의 OA URL 자동 탐색
//
// MOC.md / overview §5 에 명시된 우선순위 미입수 PDF 8편 + 추가 후보들을
// OpenAlex로 조회하여:
//   - 존재 여부 확인
//   - is_oa: true인 경우 oa_url 보고 → 즉시 다운로드 가능
//   - 그 외엔 cited_by_count + source 정보로 입수 우선순위 결정 보조
//
// 사용:
//   node _workspace/find_missing_pdfs.js
//
// 산출물: _workspace/missing_pdfs_lookup.md

const fs = require('fs');
const path = require('path');
const oa = require('./openalex_helper');

const OUT = path.resolve(__dirname, 'missing_pdfs_lookup.md');

// 우선순위 미입수 PDF 후보 — overview §5 + paper2 핵심
const MISSING = [
  // ★★ Top 8 (overview §5)
  { name: 'Rogoff (1990)',                       doi: '',                              title: 'Equilibrium political budget cycles', year: 1990, ref: 'paper1 J / paper2 B-1', priority: 'top1' },
  { name: 'Callaway & Sant\'Anna (2021)',        doi: '10.1016/j.jeconom.2020.12.001', title: 'Difference-in-differences with multiple time periods', year: 2021, ref: 'paper2 E-1, separate', priority: 'top2' },
  { name: 'Goodman-Bacon (2021)',                doi: '10.1016/j.jeconom.2021.03.014', title: 'Difference-in-differences with variation in treatment timing', year: 2021, ref: 'paper2 E-2, separate', priority: 'top3' },
  { name: 'Krippendorff (2011)',                 doi: '',                              title: 'Computing Krippendorff\'s Alpha-Reliability', year: 2011, ref: 'paper1 F-2', priority: 'top4' },
  { name: 'Mildenberger (2020) Carbon Captured', doi: '10.7551/mitpress/12393.001.0001', title: 'Carbon captured: How business and labor control climate politics', year: 2020, ref: 'paper2 A-1 (book)', priority: 'top5' },
  { name: 'Konisky & Woods (2012)',              doi: '10.1111/j.1541-1338.2012.00570.x', title: 'Measuring state environmental policy', year: 2012, ref: 'paper1 J-1 / paper2 R', priority: 'top6' },
  { name: 'Krellenberg et al. (2019)',           doi: '10.3390/su11041116',            title: 'Urban sustainability strategies guided by the SDGs', year: 2019, ref: 'paper2 D-1', priority: 'top8' },
  // 추가 paper2 핵심
  { name: 'Sun & Abraham (2021)',                doi: '10.1016/j.jeconom.2020.09.006', title: 'Estimating dynamic treatment effects in event studies with heterogeneous treatment effects', year: 2021, ref: 'paper2 E-4', priority: 'mid' },
  { name: 'de Chaisemartin & D\'Haultfœuille (2020)', doi: '10.1257/aer.20181169',       title: 'Two-way fixed effects estimators with heterogeneous treatment effects', year: 2020, ref: 'paper2 E-3', priority: 'mid' },
  { name: 'Roth, Sant\'Anna, Bilinski & Poe (2023)', doi: '10.1016/j.jeconom.2023.03.008', title: 'What\'s trending in difference-in-differences?', year: 2023, ref: 'paper2 E-6', priority: 'mid' },
  { name: 'Bertrand, Duflo & Mullainathan (2004)', doi: '10.1162/003355304772839588',  title: 'How much should we trust differences-in-differences estimates?', year: 2004, ref: 'paper2 E-9', priority: 'mid' },
  { name: 'Tews, Busch & Jörgens (2003)',        doi: '10.1111/1475-6765.00096',       title: 'The diffusion of new environmental policy instruments', year: 2003, ref: 'paper2 H-1', priority: 'mid' },
  { name: 'Shipan & Volden (2008)',              doi: '10.1111/j.1540-5907.2008.00346.x', title: 'The mechanisms of policy diffusion', year: 2008, ref: 'paper2 H-3', priority: 'mid' },
  // paper1 IAA + 신제도주의
  { name: 'Cohen (1960)',                        doi: '10.1177/001316446002000104',    title: 'A coefficient of agreement for nominal scales', year: 1960, ref: 'paper1 K-3', priority: 'mid' },
  { name: 'Fleiss (1971)',                       doi: '10.1037/h0031619',              title: 'Measuring nominal scale agreement among many raters', year: 1971, ref: 'paper1 K-4', priority: 'mid' },
  { name: 'Landis & Koch (1977)',                doi: '10.2307/2529310',               title: 'The measurement of observer agreement for categorical data', year: 1977, ref: 'paper1 F-3', priority: 'mid' },
  { name: 'Hall & Taylor (1996)',                doi: '10.1111/j.1467-9248.1996.tb00343.x', title: 'Political science and the three new institutionalisms', year: 1996, ref: 'paper2 C-2', priority: 'mid' },
  // SDG/Korean
  { name: 'LaFleur (2023) UN DESA WP 180',       doi: '10.18356/25206656-180',         title: 'Using large language models to help train machine learning SDG classifiers', year: 2023, ref: 'paper1 A-2', priority: 'mid' },
  { name: 'Guisiano, Chiky & de Mello (2022) SDG-Meter', doi: '10.1007/978-3-031-21743-2_21', title: 'SDG-Meter: A Deep Learning Based Tool for Automatic Text Classification of the Sustainable Development Goals', year: 2022, ref: 'paper1 A-5', priority: 'mid' },
  { name: 'Matsui et al. (2022)',                doi: '10.1007/s11625-022-01093-3',    title: 'A natural language processing model for supporting sustainable development goals', year: 2022, ref: 'paper1 C-2 (★ 사용자 파일은 IBEC 2019)', priority: 'mid' },
];

(async () => {
  console.log(`🔍 Looking up ${MISSING.length} missing references via OpenAlex...\n`);

  const results = [];
  for (let i = 0; i < MISSING.length; i++) {
    const ref = MISSING[i];
    process.stdout.write(`[${i + 1}/${MISSING.length}] ${ref.name}  `);
    let r;
    try {
      if (ref.doi) {
        r = await oa.verifyByDOI(ref.doi);
      } else {
        r = await oa.verifyByTitle(ref.title, ref.year);
        if (r.best) r = { exists: r.exists, ...r.best, confidence: r.confidence };
      }
    } catch (e) {
      r = { exists: false, error: e.message };
    }
    console.log(r.exists ? `✓ ${r.cited_by_count ?? '?'} cites${r.is_oa ? ' [OA]' : ''}` : `✗ ${r.error || 'not found'}`);
    results.push({ ...ref, oa: r });
  }

  // ─── 보고서 ───
  const found = results.filter(r => r.oa.exists);
  const oaAvail = found.filter(r => r.oa.is_oa && r.oa.oa_url);
  const notFound = results.filter(r => !r.oa.exists);

  let md = `# 우선순위 미입수 PDF — OpenAlex 자동 탐색 결과

> 생성: ${new Date().toISOString()}
> ${results.length}편 조회 / ${found.length}편 OpenAlex 매치 / **${oaAvail.length}편 OA PDF 즉시 다운로드 가능**

## 📥 즉시 다운로드 가능 (Open Access)

| 우선 | 논문 | OA PDF URL | cited_by | source |
|---|---|---|---:|---|
`;
  for (const r of oaAvail) {
    md += `| ${r.priority} | **${r.name}** (${r.ref}) | [📥 PDF](${r.oa.oa_url}) | ${r.oa.cited_by_count ?? '-'} | ${r.oa.source || '-'} |\n`;
  }

  md += `\n## ✓ OpenAlex 매치 (OA 아님 → 도서관·DOI 직접)\n\n| 우선 | 논문 | DOI | cited_by | source |\n|---|---|---|---:|---|\n`;
  for (const r of found.filter(f => !(f.oa.is_oa && f.oa.oa_url))) {
    md += `| ${r.priority} | **${r.name}** (${r.ref}) | [${r.oa.doi || '-'}](https://doi.org/${r.oa.doi}) | ${r.oa.cited_by_count ?? '-'} | ${r.oa.source || '-'} |\n`;
  }

  if (notFound.length > 0) {
    md += `\n## ✗ OpenAlex 미발견 (수동 입수)\n\n| 우선 | 논문 | 입력 DOI/title | 사유 |\n|---|---|---|---|\n`;
    for (const r of notFound) {
      md += `| ${r.priority} | ${r.name} (${r.ref}) | ${r.doi || r.title} | ${r.oa.error || 'no result'} |\n`;
    }
  }

  md += `\n---\n\n## 다음 단계\n\n1. 위 OA PDF 링크를 \`papers/\` 디렉토리로 다운로드\n2. 파일명을 \`{author}-{year}-{first-5-words}.pdf\` 규칙으로 명명\n3. \`sources/{stem}.md\` + \`wiki/{category}/{stem}.md\` 작성 (CLAUDE.md Step 2-3)\n4. \`index.md\` + \`MOC.md\` Dataview는 자동 갱신됨\n`;

  fs.writeFileSync(OUT, md);
  console.log(`\n📝 ${OUT}`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
