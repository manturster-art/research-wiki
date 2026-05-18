// crossref_helper.js — Crossref REST API × Claude Code Pattern B 헬퍼 (Node.js)
//
// 목적: OpenAlex와 **독립적인 두 번째 ground truth**. 두 DB가 일치하면 신뢰도 ↑,
//       두 DB가 다르면 그때만 ★주의 격상. 같은 LLM 두 번보다 효과적인 cross-check.
//
// API 문서: https://api.crossref.org/swagger-ui/index.html
//   - 키 불필요 (무료, 무제한 가까운 polite pool)
//   - CROSSREF_MAILTO 권장: User-Agent에 메일 포함하면 polite pool (더 높은 rate limit)
//
// ─── 환경 변수 ───
//   CROSSREF_MAILTO — polite pool 진입용 이메일. _workspace/.env에 저장.
//
// ─── 노출 함수 (require 시 사용) ───
//   getWorkByDOI(doi)        — DOI로 Work 단건 조회
//   searchWorks(query, opts) — 자유 검색 (?query=)
//   verifyByDOI(doi)         — reference-manager용: 존재 여부·서지 5필드 반환
//   verifyByTitle(title, y)  — DOI가 없을 때 제목+연도로 fuzzy 검증
//   diagnose()               — 환경 진단
//
// ─── OpenAlex helper와 동일한 shrinkWork 스키마 반환 ───
//   { exists, id (DOI URL), title, authors[], year, doi, cited_by_count, source, type }
//   → wiki-verifier가 OpenAlex 결과와 같은 코드로 비교 가능

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ─── .env 자동 로드 (간단 파서, dotenv 의존성 회피) ───
const ENV_PATHS = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
];
for (const p of ENV_PATHS) {
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

const CROSSREF_MAILTO = process.env.CROSSREF_MAILTO || process.env.OPENALEX_MAILTO || null;
const BASE = 'https://api.crossref.org';
const CACHE_DIR = path.resolve(__dirname, '.crossref_cache');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ─── User-Agent에 mailto 포함하면 Crossref polite pool 진입 ───
function userAgent() {
  const base = 'sdgs-paper-research/1.0 (Pattern B)';
  return CROSSREF_MAILTO ? `${base} (mailto:${CROSSREF_MAILTO})` : base;
}

function buildUrl(endpoint, params = {}) {
  // mailto 쿼리 파라미터도 추가 (User-Agent와 중복 보험)
  const merged = { ...params };
  if (CROSSREF_MAILTO && !merged.mailto) merged.mailto = CROSSREF_MAILTO;
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${BASE}${endpoint}${qs ? sep + qs : ''}`;
}

function httpGet(url, { retries = 3, backoffMs = 600 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = https.get(url, { headers: { 'User-Agent': userAgent() } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('invalid JSON: ' + e.message)); }
          } else if ([429, 500, 502, 503, 504].includes(res.statusCode) && n > 0) {
            const wait = backoffMs * (4 - n);
            setTimeout(() => attempt(n - 1), wait);
          } else {
            reject(Object.assign(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`), {
              status: res.statusCode, body,
            }));
          }
        });
      });
      req.on('error', (e) => { if (n > 0) setTimeout(() => attempt(n - 1), backoffMs); else reject(e); });
      req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
    };
    attempt(retries);
  });
}

function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
}

async function cachedGet(url) {
  const key = cacheKey(url);
  const cachePath = path.join(CACHE_DIR, key + '.json');
  if (fs.existsSync(cachePath)) {
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
  }
  const data = await httpGet(url);
  fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

// ─── 단건 조회 ───
async function getWorkByDOI(doi) {
  const cleaned = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '').trim();
  // Crossref DOI는 URL 인코딩 필요 (슬래시 포함)
  return await cachedGet(buildUrl(`/works/${encodeURIComponent(cleaned)}`));
}

async function searchWorks(query, { rows = 5, filter = null } = {}) {
  const params = { query, rows };
  if (filter) params.filter = filter;
  return await cachedGet(buildUrl('/works', params));
}

// ─── Crossref 응답 → OpenAlex와 동일 스키마로 정규화 ───
function extractYear(msg) {
  // 우선순위: published-print > published-online > issued > created
  const tryField = (f) => {
    const dp = msg[f]?.['date-parts'];
    return Array.isArray(dp) && dp[0] && dp[0][0] ? dp[0][0] : null;
  };
  return tryField('published-print')
    || tryField('published-online')
    || tryField('issued')
    || tryField('published')
    || tryField('created')
    || null;
}

function shrinkAuthors(authors) {
  if (!Array.isArray(authors)) return [];
  return authors.slice(0, 5).map((a, idx) => ({
    name: [a.given, a.family].filter(Boolean).join(' ') || a.name || null,
    orcid: a.ORCID ? a.ORCID.replace(/^https?:\/\/orcid\.org\//, '') : null,
    position: idx === 0 ? 'first' : (idx === authors.length - 1 ? 'last' : 'middle'),
  }));
}

function shrinkWork(msg) {
  if (!msg) return null;
  const title = Array.isArray(msg.title) ? msg.title[0] : msg.title;
  return {
    id: msg.DOI ? `https://doi.org/${msg.DOI}` : null,
    title: title || null,
    authors: shrinkAuthors(msg.author),
    year: extractYear(msg),
    doi: msg.DOI || null,
    cited_by_count: msg['is-referenced-by-count'] ?? null,
    type: msg.type || null,
    source: (Array.isArray(msg['container-title']) ? msg['container-title'][0] : msg['container-title']) || msg.publisher || null,
    // Crossref는 OA URL을 직접 안 줌. publisher 페이지(URL)만 있음.
    is_oa: null,
    oa_url: null,
    publisher_url: msg.URL || null,
  };
}

async function verifyByDOI(doi) {
  try {
    const data = await getWorkByDOI(doi);
    if (data.status !== 'ok' || !data.message) {
      return { exists: false, error: 'unexpected response', doi };
    }
    return { exists: true, ...shrinkWork(data.message) };
  } catch (e) {
    // 404는 "존재하지 않음", 다른 에러는 네트워크 등
    if (e.status === 404) return { exists: false, doi, reason: 'not in Crossref' };
    return { exists: false, error: e.message, doi };
  }
}

async function verifyByTitle(title, year = null) {
  try {
    const params = { 'query.bibliographic': title, rows: 5 };
    if (year) params.filter = `from-pub-date:${year},until-pub-date:${year}`;
    const data = await cachedGet(buildUrl('/works', params));
    const items = data?.message?.items;
    if (!items || !items.length) return { exists: false, query: title, year };
    const norm = s => (s || '').toLowerCase().replace(/[^\w가-힣 ]/g, ' ').split(/\s+/).filter(Boolean);
    const qTokens = new Set(norm(title));
    const candidates = items.slice(0, 5).map(msg => {
      const cTitle = Array.isArray(msg.title) ? msg.title[0] : msg.title;
      const cTokens = norm(cTitle);
      const overlap = cTokens.filter(t => qTokens.has(t)).length;
      const score = overlap / Math.max(qTokens.size, cTokens.length || 1);
      return { score, ...shrinkWork(msg) };
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return {
      exists: best.score >= 0.6,
      confidence: best.score,
      best,
      candidates: candidates.slice(0, 3),
      query: title,
      year,
    };
  } catch (e) {
    return { exists: false, error: e.message, query: title, year };
  }
}

// ─── OpenAlex 결과와 cross-check ───
// 두 DB의 verifyByDOI 결과를 받아 일치/불일치 보고
function compareWithOpenAlex(crossref, openalex) {
  if (!crossref.exists || !openalex.exists) {
    return {
      both_exist: false,
      crossref_exists: crossref.exists,
      openalex_exists: openalex.exists,
    };
  }
  const norm = s => (s || '').toLowerCase().replace(/[^\w가-힣 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const titleMatch = norm(crossref.title) === norm(openalex.title);
  const yearMatch = crossref.year === openalex.year;
  const crAuthors = crossref.authors.map(a => norm(a.name));
  const oaAuthors = openalex.authors.map(a => norm(a.name));
  const firstAuthorMatch = crAuthors[0] && oaAuthors[0] && (
    crAuthors[0] === oaAuthors[0] ||
    crAuthors[0].split(' ').slice(-1)[0] === oaAuthors[0].split(' ').slice(-1)[0] // 성씨 매치
  );
  return {
    both_exist: true,
    title_match: titleMatch,
    year_match: yearMatch,
    first_author_match: firstAuthorMatch,
    cited_by_diff: (crossref.cited_by_count ?? 0) - (openalex.cited_by_count ?? 0),
    discrepancies: [
      !titleMatch && { field: 'title', crossref: crossref.title, openalex: openalex.title },
      !yearMatch && { field: 'year', crossref: crossref.year, openalex: openalex.year },
      !firstAuthorMatch && { field: 'first_author', crossref: crAuthors[0], openalex: oaAuthors[0] },
    ].filter(Boolean),
  };
}

function diagnose() {
  const out = {
    has_mailto: !!CROSSREF_MAILTO,
    base: BASE,
    cache_dir: CACHE_DIR,
    cache_files: fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).length : 0,
  };
  if (!CROSSREF_MAILTO) {
    out.warning = '❗ CROSSREF_MAILTO 미설정 — polite pool 진입 안 함. _workspace/.env 에 CROSSREF_MAILTO=you@example.com 추가 권장.';
  }
  return out;
}

module.exports = {
  getWorkByDOI,
  searchWorks,
  verifyByDOI,
  verifyByTitle,
  compareWithOpenAlex,
  diagnose,
  _internals: { buildUrl, cachedGet, httpGet, shrinkWork, CROSSREF_MAILTO: !!CROSSREF_MAILTO },
};

// ─── CLI: node crossref_helper.js [diagnose|doi <DOI>|title <TITLE> [YEAR]|crosscheck <DOI>] ───
if (require.main === module) {
  (async () => {
    const cmd = process.argv[2] || 'diagnose';
    if (cmd === 'diagnose') {
      console.log(JSON.stringify(diagnose(), null, 2));
    } else if (cmd === 'doi') {
      const doi = process.argv[3];
      if (!doi) { console.error('usage: node crossref_helper.js doi <DOI>'); process.exit(1); }
      const r = await verifyByDOI(doi);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'title') {
      const title = process.argv[3];
      const year = process.argv[4] ? parseInt(process.argv[4], 10) : null;
      if (!title) { console.error('usage: node crossref_helper.js title "<TITLE>" [YEAR]'); process.exit(1); }
      const r = await verifyByTitle(title, year);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'crosscheck') {
      // OpenAlex와 동일 DOI 동시 조회 + 비교
      const doi = process.argv[3];
      if (!doi) { console.error('usage: node crossref_helper.js crosscheck <DOI>'); process.exit(1); }
      const oa = require('./openalex_helper');
      const [cr, oaRes] = await Promise.all([verifyByDOI(doi), oa.verifyByDOI(doi)]);
      const cmp = compareWithOpenAlex(cr, oaRes);
      console.log(JSON.stringify({ crossref: cr, openalex: oaRes, comparison: cmp }, null, 2));
    } else {
      console.error(`unknown command: ${cmd}\nusage: diagnose | doi <DOI> | title "<TITLE>" [YEAR] | crosscheck <DOI>`);
      process.exit(1);
    }
  })().catch(e => { console.error('error:', e.message); process.exit(1); });
}
