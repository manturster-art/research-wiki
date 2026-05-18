// audit_titles.js — 모든 wiki 항목 제목을 OpenAlex 정본과 strict 대조
// 산출물: _workspace/title_audit.md
//
// wiki/**/*.md 의 frontmatter title 을 OpenAlex 정본 title 과 비교.
// 정규화(소문자, 특수문자 제거, 공백 정리) 후 불일치 검출.

const fs = require('fs');
const path = require('path');
const oa = require('./openalex_helper');

const WIKI_ROOT = path.resolve(__dirname, '..', 'wiki');
const OUT = path.resolve(__dirname, 'title_audit.md');

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, '');
    data[kv[1]] = v;
  }
  return data;
}

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(full));
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// 제목 정규화: 소문자 + 영숫자/한글/공백만 + 공백 정리
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w가-힣 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 토큰 자카드 유사도
function jaccard(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

(async () => {
  const files = walkMd(WIKI_ROOT).filter(f => !f.includes('overviews'));
  console.log(`Auditing ${files.length} wiki reference pages...\n`);

  const rows = [];
  for (let i = 0; i < files.length; i++) {
    const fm = parseFrontmatter(fs.readFileSync(files[i], 'utf8'));
    if (!fm.title) continue;
    const stem = path.basename(files[i], '.md');
    process.stdout.write(`[${i + 1}/${files.length}] ${stem}  `);

    let oaTitle = null, oaStatus = '';
    try {
      if (fm.doi && fm.doi.trim()) {
        const r = await oa.verifyByDOI(fm.doi);
        if (r.exists) { oaTitle = r.title; oaStatus = 'doi'; }
        else oaStatus = 'doi-notfound';
      } else {
        const r = await oa.verifyByTitle(fm.title, parseInt(fm.year, 10) || null);
        if (r.exists && r.best) { oaTitle = r.best.title; oaStatus = `title(conf=${r.confidence?.toFixed(2)})`; }
        else if (r.best) { oaTitle = r.best.title; oaStatus = `title-lowconf(${r.confidence?.toFixed(2)})`; }
        else oaStatus = 'title-notfound';
      }
    } catch (e) {
      oaStatus = 'error: ' + e.message;
    }

    const sim = oaTitle ? jaccard(fm.title, oaTitle) : null;
    const match = sim !== null && sim >= 0.97;
    console.log(oaTitle ? (match ? '✓ exact' : `⚠ diff (sim=${sim.toFixed(2)})`) : `· ${oaStatus}`);
    rows.push({ stem, wikiTitle: fm.title, oaTitle, oaStatus, sim, match });
  }

  const exact = rows.filter(r => r.match);
  const diff = rows.filter(r => r.oaTitle && !r.match);
  const noOA = rows.filter(r => !r.oaTitle);

  let md = `# Wiki 제목 감사 — OpenAlex 정본 대조

> 생성: ${new Date().toISOString()}
> ${rows.length}편 / 정본 일치 ${exact.length} / 불일치 ${diff.length} / OpenAlex 미확인 ${noOA.length}

## ⚠️ 제목 불일치 (정본으로 수정 검토)

`;
  if (diff.length === 0) {
    md += `(없음 — 모든 OpenAlex 확인 항목이 정본과 일치)\n`;
  } else {
    for (const r of diff) {
      md += `### \`${r.stem}\` (유사도 ${r.sim.toFixed(2)}, ${r.oaStatus})\n`;
      md += `- **wiki**: ${r.wikiTitle}\n`;
      md += `- **OpenAlex 정본**: ${r.oaTitle}\n\n`;
    }
  }

  md += `\n## · OpenAlex 미확인 (수동 점검 — 정부문서·기술보고서 등)\n\n`;
  for (const r of noOA) {
    md += `- \`${r.stem}\` — ${r.oaStatus} — wiki title: "${r.wikiTitle.slice(0, 70)}"\n`;
  }

  md += `\n## ✓ 정본 일치 (${exact.length}편)\n\n`;
  for (const r of exact) md += `- \`${r.stem}\`\n`;

  fs.writeFileSync(OUT, md);
  console.log(`\n📝 ${OUT}`);
  console.log(`✅ exact: ${exact.length} / diff: ${diff.length} / no-OA: ${noOA.length}`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
