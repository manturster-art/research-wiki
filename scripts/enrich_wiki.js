// enrich_wiki.js — LLM Wiki × OpenAlex 일괄 검증·풍부화
//
// 모든 wiki/**/*.md 의 frontmatter를 읽어 OpenAlex로 검증:
//   - doi != ""  → verifyByDOI
//   - doi == ""  → verifyByTitle(title, year)
// 결과를 비교해서 drift(저자/연도/제목 불일치) + 누락 메타(W-ID, cited_by, OA URL) 보고.
//
// SHA256 incremental cache (2026-05+):
//   - 각 wiki 항목의 검증 관련 필드(title/authors/year/doi/pdf_filename)를 SHA256으로 해시
//   - 캐시: _workspace/.openalex_cache/wiki_verification_state.json
//   - hash 일치 + TTL 30일 이내 → API 호출 skip (이전 결과 재사용)
//   - hash 다르거나 TTL 초과 → 새로 검증, 캐시 갱신
//   - --force로 캐시 무효화 가능
//
// 사용:
//   node _workspace/enrich_wiki.js                  # 전체 검증 (캐시 사용)
//   node _workspace/enrich_wiki.js --force          # 캐시 무시하고 전수 재검증
//   node _workspace/enrich_wiki.js --dry            # API 호출 없이 wiki만 파싱·요약
//   node _workspace/enrich_wiki.js --only=grimmer   # 파일명 패턴 일부만
//
// 산출물:
//   _workspace/openalex_enrichment.json            (구조화된 검증 결과)
//   _workspace/openalex_enrichment.md              (사람이 읽는 보고서)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const oa = require('./openalex_helper');

const WIKI_ROOT = path.resolve(__dirname, '..', 'wiki');
const OUT_JSON = path.resolve(__dirname, 'openalex_enrichment.json');
const OUT_MD = path.resolve(__dirname, 'openalex_enrichment.md');
const CACHE_DIR = path.resolve(__dirname, '.openalex_cache');
const STATE_PATH = path.resolve(CACHE_DIR, 'wiki_verification_state.json');
const TTL_DAYS = 30;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].toLowerCase() : null;

// ─── SHA256 cache helpers ───
function loadState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(state) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
function hashWikiEntry(fm) {
  // 검증 관련 필드만 해시 (tags·source·pdf_path 등 변경은 재검증 불필요)
  const sig = JSON.stringify({
    title: fm.title || '',
    authors: Array.isArray(fm.authors) ? fm.authors.join(',') : (fm.authors || ''),
    year: String(fm.year || ''),
    doi: fm.doi || '',
    pdf_filename: fm.pdf_filename || '',
  });
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}
function isCacheValid(cached) {
  if (!cached || !cached.verified_at) return false;
  const ageDays = (Date.now() - new Date(cached.verified_at).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays < TTL_DAYS;
}

// ─── 매우 간단한 frontmatter 파서 (gray-matter 의존성 회피) ───
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const yaml = m[1];
  const data = {};
  const lines = yaml.split(/\r?\n/);
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    // remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // simple list: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
    data[key] = val;
  }
  return data;
}

function walkMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function normAuthors(authorsStr) {
  if (!authorsStr) return [];
  if (Array.isArray(authorsStr)) authorsStr = authorsStr.join(', ');
  return String(authorsStr)
    .replace(/[,&]+/g, ',')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function lastNameOnly(name) {
  // "Daniele Guariso" → "guariso"; "이정석" → "이정석"
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase().replace(/[^\w가-힣]/g, '');
}

function compareAuthors(wikiAuthorsStr, oaAuthors) {
  const wikiLast = normAuthors(wikiAuthorsStr).map(lastNameOnly).filter(Boolean);
  const oaLast = (oaAuthors || []).map(a => lastNameOnly(a.name || ''));
  const overlap = wikiLast.filter(w => oaLast.includes(w));
  return {
    wiki_first_author: wikiLast[0] || null,
    oa_first_author: oaLast[0] || null,
    first_match: wikiLast[0] === oaLast[0],
    overlap_count: overlap.length,
    wiki_count: wikiLast.length,
    oa_count: oaLast.length,
  };
}

(async () => {
  console.log(`📖 Scanning ${WIKI_ROOT}...`);
  const files = walkMd(WIKI_ROOT);
  console.log(`Found ${files.length} markdown files.\n`);

  const entries = [];
  for (const file of files) {
    const md = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(md);
    if (!fm.title) continue; // skip non-paper pages without title
    if (fm.category === 'overviews') continue; // skip overview pages
    if (ONLY && !path.basename(file).toLowerCase().includes(ONLY)) continue;
    entries.push({ file, fm });
  }
  console.log(`📋 ${entries.length} reference entries to process${DRY ? ' (DRY RUN)' : ''}${FORCE ? ' (FORCE — cache bypassed)' : ''}.\n`);

  const state = (DRY || FORCE) ? {} : loadState();
  const newState = { ...state };
  let cacheHits = 0;
  let newVerifications = 0;

  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const { file, fm } = entries[i];
    const stem = path.basename(file, '.md');
    const hasDoi = fm.doi && fm.doi.trim() !== '';
    const lookupKind = hasDoi ? 'doi' : 'title';
    const wikiHash = hashWikiEntry(fm);

    process.stdout.write(`[${i + 1}/${entries.length}] ${stem}  →  ${lookupKind}  `);

    if (DRY) {
      console.log(`(dry) ${hasDoi ? fm.doi : fm.title.slice(0, 60)}`);
      results.push({ stem, file: path.relative(path.dirname(WIKI_ROOT), file), wiki: fm, oa: null, dry: true });
      continue;
    }

    // ─── 캐시 검사 ───
    const cached = state[stem];
    if (!FORCE && cached && cached.hash === wikiHash && isCacheValid(cached)) {
      console.log(`⏭  cached (${cached.verified_at.slice(0, 10)})`);
      cacheHits++;
      results.push({
        stem,
        file: path.relative(path.dirname(WIKI_ROOT), file),
        wiki: {
          title: fm.title, authors: fm.authors, year: fm.year, doi: fm.doi,
          category: fm.category, paper: fm.paper, ref_code: fm.ref_code,
          pdf_filename: fm.pdf_filename,
        },
        oa: cached.oa,
        comparison: cached.comparison,
        fromCache: true,
        cacheDate: cached.verified_at,
      });
      newState[stem] = cached; // 유지
      continue;
    }

    let oaResult;
    try {
      if (hasDoi) {
        oaResult = await oa.verifyByDOI(fm.doi);
      } else if (fm.title) {
        const yr = parseInt(fm.year, 10) || null;
        oaResult = await oa.verifyByTitle(fm.title, yr);
      } else {
        oaResult = { exists: false, error: 'no DOI nor title' };
      }
    } catch (e) {
      oaResult = { exists: false, error: e.message };
    }
    newVerifications++;

    const status = oaResult.exists ? '✓' : '✗';
    console.log(`${status} ${oaResult.exists ? (oaResult.title || '').slice(0, 50) : (oaResult.error || 'unknown')}`);

    let comparison = null;
    if (oaResult.exists) {
      comparison = compareAuthors(fm.authors, oaResult.authors || (oaResult.best && oaResult.best.authors));
    }

    const entry = {
      stem,
      file: path.relative(path.dirname(WIKI_ROOT), file),
      wiki: {
        title: fm.title, authors: fm.authors, year: fm.year, doi: fm.doi,
        category: fm.category, paper: fm.paper, ref_code: fm.ref_code,
        pdf_filename: fm.pdf_filename,
      },
      oa: oaResult,
      comparison,
    };
    results.push(entry);

    // 캐시 갱신
    newState[stem] = {
      hash: wikiHash,
      verified_at: new Date().toISOString(),
      oa: oaResult,
      comparison,
    };
  }

  // 캐시 저장 (DRY 모드 아닐 때만)
  if (!DRY) {
    // 사라진 stem 제거
    const liveStem = new Set(entries.map(e => path.basename(e.file, '.md')));
    for (const k of Object.keys(newState)) {
      if (!liveStem.has(k)) delete newState[k];
    }
    saveState(newState);
    console.log(`\n💾 cache: ${cacheHits} hit · ${newVerifications} new (${STATE_PATH})`);
    if (cacheHits > 0 && !FORCE) {
      console.log(`   ⓘ ${cacheHits}편이 캐시에서 재사용됨. 전수 재검증은 --force`);
    }
  }

  // ─── JSON 저장 ───
  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  console.log(`\n💾 ${OUT_JSON}`);

  // ─── Markdown 보고서 생성 ───
  const verified = results.filter(r => r.oa && r.oa.exists);
  const failed = results.filter(r => r.oa && !r.oa.exists);
  const drift = verified.filter(r => r.comparison && !r.comparison.first_match);
  const oaPdfsAvailable = verified.filter(r => r.oa.is_oa && r.oa.oa_url);
  const missingDoi = verified.filter(r => !r.wiki.doi || r.wiki.doi.trim() === '');

  const fromCache = results.filter(r => r.fromCache);
  let report = `# OpenAlex × LLM Wiki — 검증·풍부화 보고서

> 생성: ${new Date().toISOString()}
> 검증 대상: ${results.length}편 / 성공: ${verified.length} / 실패: ${failed.length}
> ${fromCache.length > 0 ? `**캐시 재사용**: ${fromCache.length}편 (TTL ${TTL_DAYS}일 이내 + frontmatter SHA256 일치). 전수 재검증은 \`--force\`.` : '캐시 미사용 (전수 신규 검증).'}
> 기준: D16 anti-hallucination — 모든 인용은 OpenAlex 1차 검증 통과 후 wiki 등재

## 📊 요약

| 지표 | 값 |
|---|---|
| 총 검증 시도 | ${results.length} |
| └─ 새로 검증 | ${results.length - fromCache.length} |
| └─ 캐시 재사용 | ${fromCache.length} |
| OpenAlex 매치 성공 | ${verified.length} |
| 매치 실패 (수동 확인 필요) | ${failed.length} |
| 1저자 불일치 (drift, ★ 검토 필요) | ${drift.length} |
| OA PDF URL 보유 (다운로드 가능) | ${oaPdfsAvailable.length} |
| wiki에 DOI 미입력 → OpenAlex로 발견 | ${missingDoi.length} |

`;

  if (drift.length > 0) {
    report += `\n## ⚠️ 1저자 불일치 (drift)\n\n수동 확인 후 wiki 메타데이터 정정 검토:\n\n| stem | wiki 1저자 | OpenAlex 1저자 | OpenAlex W-ID |\n|---|---|---|---|\n`;
    for (const r of drift) {
      report += `| \`${r.stem}\` | ${r.comparison.wiki_first_author || '-'} | ${r.comparison.oa_first_author || '-'} | [${r.oa.id?.split('/').pop()}](${r.oa.id}) |\n`;
    }
  }

  if (missingDoi.length > 0) {
    report += `\n## 🆕 wiki에 누락된 DOI/W-ID (OpenAlex가 발견)\n\n다음 wiki 항목에 \`doi:\` 또는 \`openalex_id:\` 필드 추가 권장:\n\n| stem | OpenAlex W-ID | DOI | cited_by | source |\n|---|---|---|---|---|\n`;
    for (const r of missingDoi) {
      const wid = r.oa.id?.split('/').pop() || '-';
      report += `| \`${r.stem}\` | [${wid}](${r.oa.id}) | ${r.oa.doi || '-'} | ${r.oa.cited_by_count ?? '-'} | ${r.oa.source || '-'} |\n`;
    }
  }

  if (oaPdfsAvailable.length > 0) {
    report += `\n## 📥 OA PDF 다운로드 가능 (papers/ 보강용)\n\n| stem | OA PDF URL | source |\n|---|---|---|\n`;
    for (const r of oaPdfsAvailable) {
      report += `| \`${r.stem}\` | [PDF](${r.oa.oa_url}) | ${r.oa.source || '-'} |\n`;
    }
  }

  if (failed.length > 0) {
    report += `\n## ✗ 검증 실패 (수동 점검)\n\n| stem | wiki DOI/title | OpenAlex 응답 |\n|---|---|---|\n`;
    for (const r of failed) {
      const key = r.wiki.doi || r.wiki.title?.slice(0, 50) || '-';
      report += `| \`${r.stem}\` | ${key} | ${r.oa?.error || 'unknown'} |\n`;
    }
  }

  report += `\n## 📋 전체 결과\n\n| stem | OA 매치 | 1저자 일치 | cited_by | OA PDF | DOI | source |\n|---|:---:|:---:|---:|:---:|---|:---:|\n`;
  for (const r of results) {
    const ok = r.oa?.exists ? '✓' : '✗';
    const fa = r.comparison?.first_match ? '✓' : (r.comparison ? '⚠' : '-');
    const cb = r.oa?.cited_by_count ?? '-';
    const oapdf = r.oa?.oa_url ? '📥' : '-';
    const doi = r.oa?.doi || r.wiki.doi || '-';
    const src = r.fromCache ? `⏭ ${r.cacheDate.slice(0, 10)}` : '🆕';
    report += `| \`${r.stem}\` | ${ok} | ${fa} | ${cb} | ${oapdf} | ${doi} | ${src} |\n`;
  }

  fs.writeFileSync(OUT_MD, report);
  console.log(`📝 ${OUT_MD}`);
  console.log(`\n✅ Done. ${verified.length}/${results.length} verified.`);
})().catch(e => { console.error('Error:', e); process.exit(1); });
