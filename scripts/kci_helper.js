// kci_helper.js — KCI Open API wrapper for D16 4-way → 5-way verification
//
// 한국학술지인용색인(KCI) API: https://open.kci.go.kr/po/openapi/openApiList.kci
//   - 인증: API 키 (URL 쿼리 ?key=)
//   - 응답: XML (UTF-8)
//   - IP whitelist: 등록한 로컬 PC에서만 동작 (claude.ai/code 원격 환경 불가)
//
// ─── 환경 변수 ───
//   KCI_API_KEY — _workspace/.env에 저장
//
// ─── 노출 함수 (require 시 사용) ───
//   verifyByTitle(title, year?)   — articleSearch endpoint
//   verifyByDOI(doi)              — articleSearch with doi param
//   verifyByControlNumber(id)     — articleDetail endpoint (ART...)
//   searchByAuthor(name, year?)   — author 파라미터로 검색 (한글명 지원)
//   diagnose()                    — 환경 점검
//
// ─── CLI 사용 ───
//   node _workspace/kci_helper.js diagnose
//   node _workspace/kci_helper.js title "컴퓨터" 2018
//   node _workspace/kci_helper.js doi 10.35873/ajmahs.2018.8.6.026
//   node _workspace/kci_helper.js detail ART002358582
//   node _workspace/kci_helper.js author "김정진"
//
// 응답 파싱: 정규식 기반 가벼운 XML 파서 (npm 의존성 회피).
// KCI 응답은 well-structured + CDATA 패턴이 일정 → 정규식으로 충분.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ─── .env 로드 ───
const ENV_PATH = path.resolve(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const KCI_API_KEY = process.env.KCI_API_KEY || null;
const BASE = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';
const CACHE_DIR = path.resolve(__dirname, '.kci_cache');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

// ─── OFFLINE 모드 (옵션 A: 캐시-공유 패턴) ───
// KCI API는 IP whitelist 방식 — 등록한 로컬 PC에서만 동작.
// 클라우드 환경(claude.ai/code remote 등)에서는 등록 안 된 IP라 API 호출 자체가 안 됨.
// 해법: 사용자 PC에서 미리 `.kci_cache/`를 채워 git commit → 클라우드는 캐시만 사용.
//
// 모드 자동 판정:
//   - KCI_OFFLINE=true 강제 (명시적)
//   - 또는 KCI_API_KEY 미설정 (자동 fallback)
// OFFLINE 모드에서는:
//   - 캐시 hit → 정상 응답
//   - 캐시 miss → 명확한 에러 메시지로 안내 ("Run on local PC and commit cache")
const OFFLINE = process.env.KCI_OFFLINE === 'true' || !KCI_API_KEY;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ─── URL builder ───
function buildUrl(params) {
  const merged = { key: KCI_API_KEY, ...params };
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${BASE}?${qs}`;
}

// ─── HTTP GET (UTF-8 XML) ───
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = https.get(url, { headers: { 'User-Agent': 'sdgs-paper-research/1.0 (Pattern B KCI)' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 429 || res.statusCode >= 500) {
            if (n < 3) {
              setTimeout(() => attempt(n + 1), 1000 * (n + 1));
              return;
            }
            return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
          resolve(body);
        });
      });
      req.on('error', (e) => {
        if (n < 3) setTimeout(() => attempt(n + 1), 1000 * (n + 1));
        else reject(e);
      });
      req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
    };
    attempt(0);
  });
}

// ─── 캐시 ───
function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 20);
}
async function cachedGet(url) {
  const key = cacheKey(url);
  const f = path.join(CACHE_DIR, `${key}.xml`);

  // OFFLINE 모드: 캐시 hit만 응답, miss는 에러
  if (OFFLINE) {
    if (fs.existsSync(f)) {
      // TTL 무시 (캐시-공유 패턴에서는 사용자 PC가 commit 한 결과를 신뢰)
      return fs.readFileSync(f, 'utf8');
    }
    const reason = !KCI_API_KEY
      ? 'KCI_API_KEY 미설정 (OFFLINE 모드 자동)'
      : 'KCI_OFFLINE=true 강제';
    const err = new Error(
      `KCI cache miss in OFFLINE mode (${reason}). ` +
      `이 항목은 사용자의 등록된 로컬 PC에서 검증 후 .kci_cache/를 git commit 해주세요. ` +
      `URL: ${url.replace(/key=[^&]+/, 'key=***')}`
    );
    err.code = 'KCI_OFFLINE_MISS';
    throw err;
  }

  // 온라인 모드: 캐시 hit + TTL 검사 → API 호출 → 캐시 저장
  if (fs.existsSync(f)) {
    const stat = fs.statSync(f);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return fs.readFileSync(f, 'utf8');
    }
  }
  const body = await httpGet(url);
  fs.writeFileSync(f, body);
  return body;
}

// ─── XML 파싱 (정규식 기반, 핵심 필드만) ───
//
// 응답 예 (articleSearch 또는 articleDetail):
//   <MetaData>
//     <inputData>...</inputData>
//     <outputData>
//       <result><total>N</total></result>
//       <record>
//         <journalInfo journal-id="...">
//           <issn>...</issn><journal-name>...</journal-name>
//           <publisher-name>...</publisher-name>
//           <pub-year>YYYY</pub-year><pub-mon>MM</pub-mon>
//           <volume>V</volume><issue>I</issue>
//         </journalInfo>
//         <articleInfo article-id="ART...">
//           <article-categories>...</article-categories>
//           <title-group>
//             <article-title lang="original"><![CDATA[원어 제목]]></article-title>
//             <article-title lang="english"><![CDATA[English Title]]></article-title>
//           </title-group>
//           <author-group>
//             <author english="..." orc-id="...">홍길동(서울대)</author>
//             <author>...</author>
//           </author-group>
//           <doi><![CDATA[...]]></doi>
//           <citation-count kci="N" wos="M">N</citation-count>
//           <url>...</url>
//         </articleInfo>
//       </record>
//     </outputData>
//   </MetaData>

function stripCdata(s) {
  if (!s) return '';
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}

function pickFirst(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? stripCdata(m[1]) : null;
}

function pickAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\s[^>]*${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

function pickAll(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push({ inner: m[1], full: m[0] });
  return out;
}

function pickArticleTitle(group, lang) {
  // <article-title lang="original">...
  const re = new RegExp(`<article-title\\s[^>]*lang\\s*=\\s*["']${lang}["'][^>]*>([\\s\\S]*?)</article-title>`);
  const m = group.match(re);
  return m ? stripCdata(m[1]) : null;
}

function parseAuthors(record) {
  // articleSearch: <author english="...">홍길동(서울대)</author>
  // articleDetail: <author author-division="1" ...><name><![CDATA[...]]></name><name-eng>...</name-eng><institution>...</institution></author>
  const authors = [];
  const groupMatch = record.match(/<author-group(?:\s[^>]*)?>([\s\S]*?)<\/author-group>/);
  if (!groupMatch) return authors;
  const group = groupMatch[1];
  for (const a of pickAll(group, 'author')) {
    // Detail format
    const nameDetail = stripCdata(pickFirst(a.inner, 'name') || '');
    const nameEng = stripCdata(pickFirst(a.inner, 'name-eng') || '');
    const inst = stripCdata(pickFirst(a.inner, 'institution') || '');
    const orcid = (a.full.match(/orc-id\s*=\s*["']([^"']+)["']/) || [])[1] || null;
    const division = (a.full.match(/author-division\s*=\s*["']([^"']+)["']/) || [])[1] || null;
    if (nameDetail) {
      authors.push({ name: nameDetail, name_eng: nameEng || null, institution: inst || null, orcid, position: division === '1' ? 'first' : 'middle' });
      continue;
    }
    // Search format: <author english="..." orc-id="...">홍길동(서울대)</author>
    const inlineEng = (a.full.match(/english\s*=\s*["']([^"']+)["']/) || [])[1] || null;
    const orcidSearch = (a.full.match(/orc-id\s*=\s*["']([^"']+)["']/) || [])[1] || null;
    const text = a.inner.replace(/<[^>]+>/g, '').trim();
    const nameMatch = text.match(/^(.+?)(?:\(([^)]+)\))?$/);
    if (nameMatch) {
      authors.push({
        name: (nameMatch[1] || '').trim(),
        name_eng: inlineEng,
        institution: nameMatch[2] ? nameMatch[2].trim() : null,
        orcid: orcidSearch,
        position: authors.length === 0 ? 'first' : 'middle',
      });
    }
  }
  return authors;
}

function parseKeywords(record) {
  const groupMatch = record.match(/<keyword-group(?:\s[^>]*)?>([\s\S]*?)<\/keyword-group>/);
  if (!groupMatch) return [];
  return pickAll(groupMatch[1], 'keyword').map(k => stripCdata(k.inner)).filter(Boolean);
}

function parseRecord(record) {
  const journalInfo = (record.match(/<journalInfo[\s\S]*?<\/journalInfo>/) || [])[0] || '';
  const articleInfo = (record.match(/<articleInfo[\s\S]*?<\/articleInfo>/) || [])[0] || '';

  const articleId = pickAttr(record, 'articleInfo', 'article-id') || pickAttr(record, 'articleInfo article-id', 'article-id');
  const issn = pickFirst(journalInfo, 'issn');
  const journalName = pickFirst(journalInfo, 'journal-name');
  const publisherName = pickFirst(journalInfo, 'publisher-name');
  const pubYear = pickFirst(journalInfo, 'pub-year');
  const pubMon = pickFirst(journalInfo, 'pub-mon');
  const volume = pickFirst(journalInfo, 'volume');
  const issue = pickFirst(journalInfo, 'issue');
  const kciReg = pickFirst(journalInfo, 'kci-registration');

  const titleGroup = (articleInfo.match(/<title-group[\s\S]*?<\/title-group>/) || [''])[0];
  const titleOriginal = pickArticleTitle(titleGroup, 'original');
  const titleEnglish = pickArticleTitle(titleGroup, 'english');
  const titleForeign = pickArticleTitle(titleGroup, 'foreign');

  const authors = parseAuthors(articleInfo);

  const doiNode = pickFirst(articleInfo, 'doi');
  const doi = doiNode ? doiNode.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim() : null;
  const uci = pickFirst(articleInfo, 'uci');
  const url = pickFirst(articleInfo, 'url');
  const fpage = pickFirst(articleInfo, 'fpage');
  const lpage = pickFirst(articleInfo, 'lpage');
  const abstractOriginal = stripCdata(pickFirst(articleInfo, 'abstract') || '');
  const keywords = parseKeywords(articleInfo);

  const cb = (articleInfo.match(/<citation-count\s[^>]*kci\s*=\s*["'](\d+)["']/) || [])[1];
  const cbWos = (articleInfo.match(/<citation-count\s[^>]*wos\s*=\s*["'](\d+)["']/) || [])[1];

  return {
    kci_article_id: articleId,
    title_ko: titleOriginal,
    title_en: titleEnglish,
    title_foreign: titleForeign,
    authors,
    year: pubYear ? parseInt(pubYear, 10) : null,
    month: pubMon ? parseInt(pubMon, 10) : null,
    journal: journalName,
    publisher: publisherName,
    issn,
    volume,
    issue,
    pages: fpage && lpage ? `${fpage}-${lpage}` : null,
    doi,
    uci,
    url,
    kci_registration: kciReg,
    keywords,
    cited_by: {
      kci: cb ? parseInt(cb, 10) : null,
      wos: cbWos ? parseInt(cbWos, 10) : null,
    },
    abstract_ko: abstractOriginal || null,
  };
}

function parseResponse(xml) {
  const totalStr = pickFirst(xml, 'total');
  const total = totalStr ? parseInt(totalStr, 10) : 0;
  if (!total) return { exists: false, total: 0 };
  const records = pickAll(xml, 'record').map(r => parseRecord(r.inner));
  return { exists: true, total, records };
}

// ─── 공개 API ───

async function verifyByTitle(title, year = null) {
  if (!KCI_API_KEY) return { exists: false, error: 'KCI_API_KEY 미설정' };
  const params = { apiCode: 'articleSearch', title, displayCount: 10 };
  if (year) {
    params.dateFrom = `${year}01`;
    params.dateTo = `${year}12`;
  }
  try {
    const url = buildUrl(params);
    const xml = await cachedGet(url);
    const r = parseResponse(xml);
    if (!r.exists) return { exists: false, total: 0, query: title };
    const best = r.records[0];
    return { exists: true, total: r.total, best, candidates: r.records.slice(0, 5), query: title };
  } catch (e) { return { exists: false, error: e.message }; }
}

async function verifyByDOI(doi) {
  if (!KCI_API_KEY) return { exists: false, error: 'KCI_API_KEY 미설정' };
  try {
    const url = buildUrl({ apiCode: 'articleSearch', doi, displayCount: 5 });
    const xml = await cachedGet(url);
    const r = parseResponse(xml);
    if (!r.exists) return { exists: false, total: 0, doi };
    return { exists: true, total: r.total, best: r.records[0], candidates: r.records, doi };
  } catch (e) { return { exists: false, error: e.message }; }
}

async function verifyByControlNumber(id) {
  if (!KCI_API_KEY) return { exists: false, error: 'KCI_API_KEY 미설정' };
  try {
    const url = buildUrl({ apiCode: 'articleDetail', id });
    const xml = await cachedGet(url);
    const r = parseResponse(xml);
    if (!r.exists) return { exists: false, id };
    return { exists: true, best: r.records[0], id };
  } catch (e) { return { exists: false, error: e.message }; }
}

async function searchByAuthor(author, year = null) {
  if (!KCI_API_KEY) return { exists: false, error: 'KCI_API_KEY 미설정' };
  try {
    const params = { apiCode: 'articleSearch', author, displayCount: 20 };
    // title 필수 — 와일드카드 효과로 공백 1자 + author로 검색
    params.title = ' ';
    if (year) { params.dateFrom = `${year}01`; params.dateTo = `${year}12`; }
    const url = buildUrl(params);
    const xml = await cachedGet(url);
    const r = parseResponse(xml);
    if (!r.exists) return { exists: false, total: 0, author };
    return { exists: true, total: r.total, candidates: r.records, author };
  } catch (e) { return { exists: false, error: e.message }; }
}

function diagnose() {
  const out = {
    has_api_key: !!KCI_API_KEY,
    mode: OFFLINE ? 'OFFLINE (cache-only)' : 'ONLINE',
    base: BASE,
    cache_dir: CACHE_DIR,
    cache_files: fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).length : 0,
    cache_ttl_days: OFFLINE ? '∞ (TTL 무시 — 캐시-공유 패턴)' : 30,
  };
  if (OFFLINE) {
    out.note = !KCI_API_KEY
      ? 'ℹ️ KCI_API_KEY 미설정 → OFFLINE 모드 자동. 캐시 hit만 응답, miss는 에러 (KCI_OFFLINE_MISS).'
      : 'ℹ️ KCI_OFFLINE=true 강제 → 캐시 hit만 응답.';
    out.cache_share_pattern = '사용자 PC에서 정기 실행(API 호출 + 캐시 채움) → git commit → 클라우드는 .kci_cache/만 읽음.';
  } else {
    out.note = '⚠️ KCI는 IP whitelist 방식 — 등록한 로컬 PC에서만 API 호출 성공. 다른 IP에서는 403 가능.';
  }
  return out;
}

// ─── OpenAlex/Crossref 결과와 cross-check ───
// KCI best 결과를 OpenAlex·Crossref 결과와 비교. wiki-verifier가 5-way 판정에 사용.
function compareWithOtherSources(kci, openalex = null, crossref = null) {
  const result = {
    kci_exists: !!kci?.exists,
    openalex_exists: !!openalex?.exists,
    crossref_exists: !!crossref?.exists,
  };

  const kciRec = kci?.best || kci;
  if (!kciRec || !kci?.exists) return result;

  const norm = s => (s || '').toLowerCase().replace(/[^\w가-힣 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const discrepancies = [];

  // 연도 비교
  const kciYear = kciRec.year;
  const oaYear = openalex?.best?.year ?? openalex?.year;
  const crYear = crossref?.best?.year ?? crossref?.year;
  const years = [kciYear, oaYear, crYear].filter(y => y != null);
  if (years.length > 1 && new Set(years).size > 1) {
    discrepancies.push({ field: 'year', kci: kciYear, openalex: oaYear, crossref: crYear });
  }

  // 제목 비교 (KCI는 한국어, OA/CR은 영문 — title_en으로 비교)
  const kciTitleEn = norm(kciRec.title_en || '');
  if (openalex?.exists) {
    const oaTitle = norm(openalex.best?.title ?? openalex.title ?? '');
    if (kciTitleEn && oaTitle) {
      const kciTokens = kciTitleEn.split(/\s+/).filter(Boolean);
      const oaTokens = new Set(oaTitle.split(/\s+/).filter(Boolean));
      const overlap = kciTokens.filter(t => oaTokens.has(t)).length;
      const score = overlap / Math.max(oaTokens.size, kciTokens.length || 1);
      if (score < 0.5) {
        discrepancies.push({ field: 'title', kci_ko: kciRec.title_ko, kci_en: kciRec.title_en, openalex: openalex.best?.title ?? openalex.title });
      }
    }
  }

  // 첫 저자 비교 (한국 이름 영문 표기 변형이 많아 성씨 매치)
  const kciFirst = kciRec.authors?.[0];
  const oaFirst = openalex?.best?.authors?.[0] ?? openalex?.authors?.[0];
  if (kciFirst && oaFirst) {
    const kciName = norm(kciFirst.name_eng || kciFirst.name || '');
    const oaName = norm(oaFirst.name || '');
    const kciLast = kciName.split(/\s+/).pop();
    const oaLast = oaName.split(/\s+/).pop();
    if (kciLast && oaLast && kciLast !== oaLast) {
      discrepancies.push({ field: 'first_author', kci: kciFirst.name, kci_en: kciFirst.name_eng, openalex: oaFirst.name });
    }
  }

  return {
    ...result,
    all_match: discrepancies.length === 0,
    discrepancies,
    kci_article_id: kciRec.kci_article_id,
    kci_registration: kciRec.kci_registration,
    kci_cited_by: kciRec.cited_by,
  };
}

module.exports = {
  verifyByTitle,
  verifyByDOI,
  verifyByControlNumber,
  searchByAuthor,
  compareWithOtherSources,
  diagnose,
  _internals: { buildUrl, parseResponse, parseRecord, BASE, has_api_key: !!KCI_API_KEY },
};

// ─── CLI ───
if (require.main === module) {
  const cmd = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  (async () => {
    let result;
    switch (cmd) {
      case 'diagnose':
        result = diagnose();
        break;
      case 'title':
        result = await verifyByTitle(arg1, arg2 ? parseInt(arg2, 10) : null);
        break;
      case 'doi':
        result = await verifyByDOI(arg1);
        break;
      case 'detail':
        result = await verifyByControlNumber(arg1);
        break;
      case 'author':
        result = await searchByAuthor(arg1, arg2 ? parseInt(arg2, 10) : null);
        break;
      case 'crosscheck': {
        // KCI + OpenAlex + Crossref 3-way 비교 (한국 논문용)
        if (!arg1) { console.error('usage: node kci_helper.js crosscheck "<TITLE>" [YEAR]'); process.exit(1); }
        const oa = require('./openalex_helper');
        const cr = require('./crossref_helper');
        const yearParsed = arg2 ? parseInt(arg2, 10) : null;
        const [kciRes, oaRes, crRes] = await Promise.all([
          verifyByTitle(arg1, yearParsed),
          oa.verifyByTitle(arg1, yearParsed),
          cr.verifyByTitle(arg1, yearParsed),
        ]);
        const cmp = compareWithOtherSources(kciRes, oaRes, crRes);
        result = { kci: kciRes, openalex: oaRes, crossref: crRes, comparison: cmp };
        break;
      }
      default:
        console.log('Usage: node kci_helper.js <cmd> [args]');
        console.log('  diagnose');
        console.log('  title "<제목>" [YYYY]');
        console.log('  doi <DOI>');
        console.log('  detail <ART...>');
        console.log('  author "<저자명>" [YYYY]');
        console.log('  crosscheck "<제목>" [YYYY]  — KCI + OpenAlex + Crossref 3-way');
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  })().catch(e => { console.error('Error:', e); process.exit(1); });
}
