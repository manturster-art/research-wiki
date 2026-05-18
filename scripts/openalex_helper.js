// openalex_helper.js — OpenAlex × Claude Code Pattern B 헬퍼 (Node.js 포팅)
//
// 원본 가이드: https://educatian.github.io/openalex-claude-code/
//   - 원문은 Python(openalex_helper.py)이지만, 본 프로젝트의 도구가 Node.js로
//     통일되어 있어 동일 함수 시그니처로 포팅함.
//
// ─── 환경 변수 ───
//   OPENALEX_KEY  — openalex.org/settings/api 에서 무료 발급 후 환경 변수 또는
//                   _workspace/.env 파일(.env.example 참고)에 저장.
//                   2026-02-13 정책 변경: api_key 미사용 시 일일 예산 $0.01로 제한됨.
//   OPENALEX_MAILTO — 키가 없을 때 fallback으로 사용할 이메일 (구식 polite pool, 곧 단종 예정)
//
// ─── 노출 함수 (require 시 사용) ───
//   getWork(id)              — Works/Authors/Sources 단건 조회 (W*, A*, S* OpenAlex ID)
//   getWorkByDOI(doi)        — DOI로 Work 단건 조회 (예: "10.1038/nature12373")
//   searchWorks(q, opts)     — 검색 (페이지네이션 자동)
//   filterWorks(filterStr)   — /works?filter=... (페이지네이션 자동)
//   citedBy(workId, opts)    — 특정 work를 인용한 논문들
//   verifyByDOI(doi)         — reference-manager용: 존재 여부·서지 5필드 반환
//   verifyByTitle(title, year) — DOI가 없을 때 제목+연도로 fuzzy 검증
//
// ─── 사용 예 ───
//   const oa = require('./openalex_helper');
//   const result = await oa.verifyByDOI('10.1038/s41558-020-0831-z');
//   // → { exists: true, id: 'W...', title: '...', authors: [...], year: 2020,
//   //     doi: '10.1038/...', cited_by_count: 412, source: 'Nature Climate Change' }

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

const OPENALEX_KEY = process.env.OPENALEX_KEY || null;
const OPENALEX_MAILTO = process.env.OPENALEX_MAILTO || null;
const BASE = 'https://api.openalex.org';
const CACHE_DIR = path.resolve(__dirname, '.openalex_cache');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ─── 인증/예의(politeness) 파라미터 자동 주입 ───
function authParams() {
  const p = {};
  if (OPENALEX_KEY) p.api_key = OPENALEX_KEY;
  else if (OPENALEX_MAILTO) p.mailto = OPENALEX_MAILTO;
  return p;
}

function buildUrl(endpoint, params = {}) {
  const merged = { ...params, ...authParams() };
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${BASE}${endpoint}${qs ? sep + qs : ''}`;
}

// ─── HTTP GET (자동 재시도 + 캐시) ───
function httpGet(url, { retries = 3, backoffMs = 600 } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = https.get(url, { headers: { 'User-Agent': 'sdgs-paper-research/1.0 (Pattern B)' } }, (res) => {
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
              status: res.statusCode, body
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
async function getWork(id) {
  // id 형식: 'W2741809807' / 'A1234567' / 'S1234567'
  const cleaned = id.startsWith('https://openalex.org/') ? id.split('/').pop() : id;
  return await cachedGet(buildUrl(`/works/${cleaned}`));
}

async function getWorkByDOI(doi) {
  const cleaned = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '').trim();
  return await cachedGet(buildUrl(`/works/doi:${cleaned}`));
}

// ─── 페이지네이션 ───
async function paginate(endpoint, baseParams = {}, { maxPages = 25, perPage = 200 } = {}) {
  const all = [];
  let cursor = '*';
  for (let i = 0; i < maxPages; i++) {
    const params = { ...baseParams, 'per-page': perPage, cursor };
    const data = await cachedGet(buildUrl(endpoint, params));
    if (!data.results || !data.results.length) break;
    all.push(...data.results);
    cursor = data.meta && data.meta.next_cursor;
    if (!cursor) break;
  }
  return all;
}

async function searchWorks(q, opts = {}) {
  return await paginate('/works', { search: q, ...opts.filter ? { filter: opts.filter } : {} }, opts);
}

async function filterWorks(filterStr, opts = {}) {
  return await paginate('/works', { filter: filterStr }, opts);
}

async function citedBy(workId, opts = {}) {
  const cleaned = workId.startsWith('https://openalex.org/') ? workId.split('/').pop() : workId;
  return await paginate('/works', { filter: `cites:${cleaned}` }, opts);
}

// ─── reference-manager용 검증 함수 ───
function shrinkAuthors(authorships) {
  if (!authorships) return [];
  return authorships.slice(0, 5).map(a => ({
    name: a.author?.display_name,
    orcid: a.author?.orcid || null,
    position: a.author_position,
  }));
}

function shrinkWork(w) {
  if (!w) return null;
  return {
    id: w.id,
    title: w.display_name || w.title,
    authors: shrinkAuthors(w.authorships),
    year: w.publication_year,
    doi: w.doi ? w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null,
    cited_by_count: w.cited_by_count,
    type: w.type,
    source: w.primary_location?.source?.display_name || null,
    is_oa: w.open_access?.is_oa || false,
    oa_url: w.open_access?.oa_url || null,
  };
}

async function verifyByDOI(doi) {
  try {
    const w = await getWorkByDOI(doi);
    return { exists: true, ...shrinkWork(w) };
  } catch (e) {
    return { exists: false, error: e.message, doi };
  }
}

// arXiv ID 또는 arXiv URL로 검증 (OpenAlex는 arXiv를 별도 색인함)
async function verifyByArxiv(arxivId) {
  const cleaned = arxivId.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '').trim();
  // OpenAlex는 arXiv DOI 형식 (10.48550/arXiv.<id>)을 우선 시도, 실패 시 ids.openalex 검색
  try {
    const w = await getWorkByDOI(`10.48550/arXiv.${cleaned}`);
    return { exists: true, via: 'arxiv-doi', ...shrinkWork(w) };
  } catch (e1) {
    try {
      const data = await cachedGet(buildUrl('/works', { filter: `ids.openalex:https://openalex.org/works?filter=ids.pmid:${cleaned}`, 'per-page': 1 }));
      if (data.results && data.results[0]) return { exists: true, via: 'arxiv-search', ...shrinkWork(data.results[0]) };
    } catch (e2) { /* fallthrough */ }
    return { exists: false, error: `arxiv:${cleaned} not found`, arxiv: cleaned };
  }
}

async function verifyByTitle(title, year = null) {
  // 제목 fuzzy 매칭 — search + 연도 필터로 1순위 후보 반환
  const params = { search: title };
  if (year) params.filter = `publication_year:${year}`;
  try {
    const data = await cachedGet(buildUrl('/works', { ...params, 'per-page': 5 }));
    if (!data.results || !data.results.length) return { exists: false, query: title, year };
    const top = data.results[0];
    // 단순 토큰 overlap 점수 (대문자 normalize)
    const norm = s => (s || '').toLowerCase().replace(/[^\w가-힣 ]/g, ' ').split(/\s+/).filter(Boolean);
    const qTokens = new Set(norm(title));
    const candidates = data.results.slice(0, 5).map(w => {
      const cTokens = norm(w.display_name);
      const overlap = cTokens.filter(t => qTokens.has(t)).length;
      const score = overlap / Math.max(qTokens.size, cTokens.length);
      return { score, ...shrinkWork(w) };
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

// ─── 진단 출력 ───
function diagnose() {
  const out = {
    has_api_key: !!OPENALEX_KEY,
    has_mailto: !!OPENALEX_MAILTO,
    cache_dir: CACHE_DIR,
    cache_files: fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).length : 0,
  };
  if (!OPENALEX_KEY) {
    out.warning = '❗ OPENALEX_KEY 미설정 — 일일 예산 $0.01로 제한됨. openalex.org/settings/api 에서 무료 발급 후 _workspace/.env 에 저장 권장.';
  }
  return out;
}

module.exports = {
  getWork,
  getWorkByDOI,
  searchWorks,
  filterWorks,
  citedBy,
  paginate,
  verifyByDOI,
  verifyByArxiv,
  verifyByTitle,
  diagnose,
  // 내부 노출 (테스트·확장용)
  _internals: { buildUrl, cachedGet, httpGet, shrinkWork, OPENALEX_KEY: !!OPENALEX_KEY },
};

// ─── CLI 실행: node openalex_helper.js [diagnose|doi <DOI>|title <TITLE>] ───
if (require.main === module) {
  (async () => {
    const cmd = process.argv[2] || 'diagnose';
    if (cmd === 'diagnose') {
      console.log(JSON.stringify(diagnose(), null, 2));
    } else if (cmd === 'doi') {
      const doi = process.argv[3];
      if (!doi) { console.error('usage: node openalex_helper.js doi <DOI>'); process.exit(1); }
      const r = await verifyByDOI(doi);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'title') {
      const title = process.argv[3];
      const year = process.argv[4] ? parseInt(process.argv[4], 10) : null;
      if (!title) { console.error('usage: node openalex_helper.js title "<TITLE>" [YEAR]'); process.exit(1); }
      const r = await verifyByTitle(title, year);
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.error(`unknown command: ${cmd}\nusage: diagnose | doi <DOI> | title "<TITLE>" [YEAR]`);
      process.exit(1);
    }
  })().catch(e => { console.error('error:', e.message); process.exit(1); });
}
