// graph_insights.js — Wiki [[wikilink]] 그래프 분석으로 사각지대 탐지
//
// nashsu/llm_wiki의 Graph Insights 발상을 D16 준수 형태로 차용:
// - LLM 자동 synthesis 안 함
// - 그래프 구조만 분석해서 "어디가 비어 있나" 리포트
// - 사용자가 보고 직접 [[link]] 추가하거나 PDF 보강
//
// 분석 (2-pass):
//   메인  = 전체 그래프 (overview 포함, "진실")
//   보조  = overview 제외 (overview 덕분에 가짜로 연결된 클러스터 발견)
//
// 사용:
//   node _workspace/graph_insights.js
//   node _workspace/graph_insights.js --hub=4    # hub 임계값 변경 (default 5)
//   node _workspace/graph_insights.js --json     # 추가로 JSON도 저장
//
// 산출물:
//   _workspace/graph_insights.md   (사람이 읽는 보고서)
//   _workspace/graph_insights.json (--json 지정 시)

const fs = require('fs');
const path = require('path');

const WIKI_ROOT = path.resolve(__dirname, '..', 'wiki');
const OUT_MD = path.resolve(__dirname, 'graph_insights.md');
const OUT_JSON = path.resolve(__dirname, 'graph_insights.json');

const args = process.argv.slice(2);
const HUB_THRESH = parseInt((args.find(a => a.startsWith('--hub=')) || '--hub=5').split('=')[1], 10);
const EMIT_JSON = args.includes('--json');

// ─── 파일 수집 + 메타 파싱 ───
function walkMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const yaml = m[1];
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[kv[1]] = val;
  }
  return data;
}

// ─── 본문 정제: 코드 블록·이미지 임베드·HTML 주석 제외 후 wikilink 추출 ───
const fenceWarnings = []; // { file, message }

function sanitizeBody(md, fileRel) {
  // 1. frontmatter 제거 (이미 파싱했으나 본문에서도 제외)
  let body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

  // 2. HTML 주석 제거 <!-- ... -->
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  // 3. fenced code block 제거 (``` 또는 ~~~, 언어 지정 포함)
  //    홀수 개 fence가 있으면 경고
  const lines = body.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceMarker = null;
  let openLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fenceMatch = ln.match(/^(\s{0,3})(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker[0]; // ` or ~
        openLine = i + 1;
        continue;
      } else if (marker[0] === fenceMarker) {
        inFence = false;
        fenceMarker = null;
        continue;
      }
    }
    if (inFence) continue;
    out.push(ln);
  }
  if (inFence) {
    fenceWarnings.push({ file: fileRel, message: `unmatched code fence (opened at line ${openLine}) — wikilinks below may be missed` });
  }
  body = out.join('\n');

  // 4. inline code `...` 제거 (single-line)
  body = body.replace(/`[^`\n]*`/g, '');

  // 5. 이미지 임베드 ![[...]] 제거 (텍스트로 [[ 시작이지만 ! 선행)
  //    Obsidian 임베드 ![[note]] 도 graph 링크로 안 침 (의도가 다름)
  body = body.replace(/!\[\[[^\[\]\n]*?\]\]/g, '');

  return body;
}

// ─── [[wikilink]] 추출 (정제된 본문 대상) ───
function extractLinks(cleanBody) {
  const links = new Set();
  const re = /\[\[([^\[\]\|\n]+?)(?:\|[^\[\]\n]+)?\]\]/g;
  let m;
  while ((m = re.exec(cleanBody)) !== null) {
    let target = m[1].trim();
    if (!target) continue;
    target = target.split('#')[0]; // strip section anchor
    target = target.replace(/\.md$/i, '').replace(/^\/+/, '');
    if (target) links.add(target);
  }
  return [...links];
}

// ─── 그래프 빌드 ───
function buildGraph() {
  const files = walkMd(WIKI_ROOT);

  // node id = category/stem (without .md)
  const nodes = new Map();
  const stemIndex = new Map();

  for (const file of files) {
    const rel = path.relative(WIKI_ROOT, file).replace(/\\/g, '/');
    const id = rel.replace(/\.md$/i, '');
    const parts = id.split('/');
    const stem = parts[parts.length - 1];
    const dirCategory = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

    const md = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(md);
    const category = fm.category || dirCategory;
    const isOverview = category === 'overviews' || dirCategory === 'overviews';

    nodes.set(id, {
      id,
      file: rel,
      stem,
      category,
      isOverview,
      title: fm.title || stem,
      paper: fm.paper || '',
      refCode: fm.ref_code || '',
      _cleanBody: sanitizeBody(md, rel),
      outLinks: new Set(),
      inLinks: new Set(),
    });

    if (!stemIndex.has(stem)) stemIndex.set(stem, []);
    stemIndex.get(stem).push(id);
  }

  function resolve(target) {
    if (nodes.has(target)) return target;
    const stripped = target.replace(/^wiki\//, '');
    if (nodes.has(stripped)) return stripped;
    const stem = target.split('/').pop();
    const candidates = stemIndex.get(stem);
    if (candidates && candidates.length === 1) return candidates[0];
    return null; // not found or ambiguous
  }

  const danglingLinks = [];
  const ambiguousLinks = [];
  for (const node of nodes.values()) {
    const links = extractLinks(node._cleanBody);
    for (const link of links) {
      const targetId = resolve(link);
      if (targetId && targetId !== node.id) {
        node.outLinks.add(targetId);
        nodes.get(targetId).inLinks.add(node.id);
      } else if (!targetId) {
        // distinguish ambiguous (multiple stem matches) from truly missing
        const stem = link.split('/').pop();
        const cand = stemIndex.get(stem);
        if (cand && cand.length > 1) {
          ambiguousLinks.push({ from: node.id, target: link, candidates: cand });
        } else {
          danglingLinks.push({ from: node.id, target: link });
        }
      }
    }
    delete node._cleanBody;
  }

  return { nodes, danglingLinks, ambiguousLinks };
}

// ─── 분석 함수들 (그래프 인자로 받음 — 2-pass 위해 재사용) ───

function computeDegrees(nodes) {
  for (const n of nodes.values()) {
    n.outDegree = n.outLinks.size;
    n.inDegree = n.inLinks.size;
    n.degree = new Set([...n.outLinks, ...n.inLinks]).size;
  }
}

function findComponents(nodes) {
  const seen = new Set();
  const components = [];
  for (const id of nodes.keys()) {
    if (seen.has(id)) continue;
    const comp = [];
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const cur = queue.shift();
      comp.push(cur);
      const node = nodes.get(cur);
      for (const nb of new Set([...node.outLinks, ...node.inLinks])) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

function findBridges(nodes) {
  const ids = [...nodes.keys()];
  const idx = new Map(ids.map((id, i) => [id, i]));
  const adj = ids.map(id => {
    const node = nodes.get(id);
    return [...new Set([...node.outLinks, ...node.inLinks])]
      .map(nb => idx.get(nb))
      .filter(i => i !== undefined);
  });

  const N = ids.length;
  const disc = new Array(N).fill(-1);
  const low = new Array(N).fill(-1);
  const parent = new Array(N).fill(-1);
  let timer = 0;
  const bridges = [];

  function dfs(u) {
    const stack = [[u, 0]];
    disc[u] = low[u] = timer++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [cur, i] = top;
      if (i < adj[cur].length) {
        top[1]++;
        const v = adj[cur][i];
        if (v === cur) continue; // ignore self-loop
        if (disc[v] === -1) {
          parent[v] = cur;
          disc[v] = low[v] = timer++;
          stack.push([v, 0]);
        } else if (v !== parent[cur]) {
          low[cur] = Math.min(low[cur], disc[v]);
        }
      } else {
        stack.pop();
        if (parent[cur] !== -1) {
          low[parent[cur]] = Math.min(low[parent[cur]], low[cur]);
          if (low[cur] > disc[parent[cur]]) {
            bridges.push([ids[parent[cur]], ids[cur]]);
          }
        }
      }
    }
  }

  for (let i = 0; i < N; i++) {
    if (disc[i] === -1) dfs(i);
  }
  return bridges;
}

function categoryMatrix(nodes) {
  const matrix = new Map();
  for (const n of nodes.values()) {
    for (const targetId of n.outLinks) {
      const t = nodes.get(targetId);
      if (!t) continue;
      const key = `${n.category || '(none)'}|${t.category || '(none)'}`;
      matrix.set(key, (matrix.get(key) || 0) + 1);
    }
  }
  return matrix;
}

function summarize(nodes) {
  computeDegrees(nodes);
  const components = findComponents(nodes);
  const bridges = findBridges(nodes);
  const all = [...nodes.values()];
  const orphans = all.filter(n => n.degree === 0).sort((a, b) => a.id.localeCompare(b.id));
  const leaves = all.filter(n => n.degree === 1).sort((a, b) => a.id.localeCompare(b.id));
  const hubs = all.filter(n => n.degree >= HUB_THRESH).sort((a, b) => b.degree - a.degree);

  return {
    pages: nodes.size,
    links: all.reduce((s, n) => s + n.outDegree, 0),
    orphans,
    leaves,
    hubs,
    components,
    bridges,
    avgDegree: nodes.size > 0
      ? (all.reduce((s, n) => s + n.degree, 0) / nodes.size).toFixed(2)
      : '0',
  };
}

// ─── overview 제외 sub-graph 빌드 (2-pass) ───
function dropOverviews(nodes) {
  const filtered = new Map();
  for (const [id, n] of nodes.entries()) {
    if (n.isOverview) continue;
    filtered.set(id, {
      ...n,
      outLinks: new Set([...n.outLinks].filter(x => !nodes.get(x)?.isOverview)),
      inLinks: new Set([...n.inLinks].filter(x => !nodes.get(x)?.isOverview)),
    });
  }
  return filtered;
}

// ─── 보고서 생성 ───
function renderSection(summary, title, note) {
  let md = `## ${title}\n\n${note}\n\n`;
  md += `| 지표 | 값 |\n|---|---|\n`;
  md += `| 위키 페이지 | ${summary.pages} |\n`;
  md += `| 유효 링크 | ${summary.links} |\n`;
  md += `| **고립 (Orphans, degree 0)** | **${summary.orphans.length}** ${summary.orphans.length > 0 ? '⚠️' : '✅'} |\n`;
  md += `| 가지 끝 (Leaves, degree 1) | ${summary.leaves.length} |\n`;
  md += `| 허브 (degree ≥ ${HUB_THRESH}) | ${summary.hubs.length} |\n`;
  md += `| 평균 degree | ${summary.avgDegree} |\n`;
  md += `| 연결 컴포넌트 | ${summary.components.length} ${summary.components.length > 1 ? '⚠️ (1개 권장)' : '✅'} |\n`;
  md += `| 최대 컴포넌트 크기 | ${summary.components[0]?.length || 0} |\n`;
  md += `| 브리지 (제거 시 분리) | ${summary.bridges.length} |\n\n`;
  return md;
}

// ─── 메인 ───
(() => {
  console.log(`📖 Scanning ${WIKI_ROOT}...`);
  const { nodes, danglingLinks, ambiguousLinks } = buildGraph();
  console.log(`Found ${nodes.size} wiki pages, ${danglingLinks.length} dangling, ${ambiguousLinks.length} ambiguous.\n`);

  if (nodes.size === 0) {
    console.log('No wiki pages yet. Add a PDF first via Scenario B.');
    return;
  }

  // PASS 1: 전체
  const main = summarize(nodes);
  // PASS 2: overview 제외
  const filtered = dropOverviews(nodes);
  const secondary = summarize(filtered);
  const matrix = categoryMatrix(nodes);

  // ─── Markdown 보고서 ───
  let md = `# Wiki Graph Insights

> 생성: ${new Date().toISOString()}
> 대상: \`wiki/**/*.md\` (${main.pages}편 · 그 중 overview ${main.pages - secondary.pages}편)
> 분석: [[wikilink]] 구조만 사용. 본문 내용·LLM synthesis 없음 (D16 준수).
> 정제: 코드 블록(\`\`\`)·인라인 코드(\`...\`)·HTML 주석·이미지 임베드(![[...]])는 링크 추출에서 제외.

`;

  // fence warnings
  if (fenceWarnings.length > 0) {
    md += `## ⚠️ 깨진 코드 블록 (${fenceWarnings.length}개 페이지)\n\n`;
    md += `해당 페이지의 wikilink 일부가 누락되었을 수 있습니다. markdown 자체를 점검하세요.\n\n`;
    md += `| File | Issue |\n|---|---|\n`;
    for (const w of fenceWarnings) md += `| \`${w.file}\` | ${w.message} |\n`;
    md += `\n`;
  }

  // 2-pass summary tables
  md += renderSection(main, '📊 메인 분석 (전체 그래프)', '모든 페이지 포함 — 위키의 실제 연결망 진실.');
  md += renderSection(secondary, '🔍 보조 분석 (overview 제외)', `overview는 본질상 다수 페이지를 인용하는 hub. 빼고 보면 "overview 없이도 클러스터가 연결되어 있나" 검증 가능. **${main.bridges.length - secondary.bridges.length >= 0 ? '두 분석의 차이가 크다면 overview에 과의존**' : '안정적**'}.`);

  // 컴포넌트 변화 비교
  if (main.components.length !== secondary.components.length) {
    md += `### 🚨 컴포넌트 수 변화\n\n`;
    md += `- 전체: ${main.components.length}개 컴포넌트\n`;
    md += `- overview 제외: ${secondary.components.length}개 컴포넌트\n`;
    md += `- **해석**: ${secondary.components.length > main.components.length
      ? `overview가 ${secondary.components.length - main.components.length}개 분리된 클러스터를 인위적으로 연결 중. 학술적 토대 논문(공통 referenced_work)으로 진짜 연결 필요.`
      : '구조 안정.'}\n\n`;
  }

  // 1. Orphans (메인 기준)
  if (main.orphans.length > 0) {
    md += `## ⚠️ 고립 페이지 (${main.orphans.length}편) — Related Papers 보강 필요\n\n`;
    md += `다른 페이지와 \`[[link]]\`로 전혀 연결되지 않음. \`## Related Papers\` 섹션을 채우거나 다른 페이지에서 이 페이지를 인용하세요.\n\n`;
    md += `| Page | Category | paper | ref_code |\n|---|---|---|---|\n`;
    for (const n of main.orphans) {
      md += `| \`${n.id}\` | ${n.category || '-'} | ${n.paper || '-'} | ${n.refCode || '-'} |\n`;
    }
    md += `\n`;
  }

  // 2. Dangling links
  if (danglingLinks.length > 0) {
    md += `## 🔗 깨진 링크 (${danglingLinks.length}건) — 페이지 부재\n\n`;
    md += `\`[[link]]\`의 타겟이 wiki에 없습니다. 페이지를 등재(Scenario B)하거나 링크를 수정하세요.\n\n`;
    md += `| From | Dangling target |\n|---|---|\n`;
    for (const dl of danglingLinks.slice(0, 50)) {
      md += `| \`${dl.from}\` | \`${dl.target}\` |\n`;
    }
    if (danglingLinks.length > 50) md += `\n_...외 ${danglingLinks.length - 50}건_\n`;
    md += `\n`;
  }

  // 3. Ambiguous links
  if (ambiguousLinks.length > 0) {
    md += `## ❓ 모호한 링크 (${ambiguousLinks.length}건) — 같은 stem 여러 카테고리에 존재\n\n`;
    md += `\`[[stem]]\` bare 표기가 둘 이상에 매치됨. Obsidian은 자동 해석하지만 분석 도구는 못 함. **\`[[category/stem]]\` 풀패스로 명시** 권장.\n\n`;
    md += `| From | Bare link | Candidates |\n|---|---|---|\n`;
    for (const al of ambiguousLinks.slice(0, 30)) {
      md += `| \`${al.from}\` | \`${al.target}\` | ${al.candidates.map(c => `\`${c}\``).join(', ')} |\n`;
    }
    md += `\n`;
  }

  // 4. Multiple components
  if (main.components.length > 1) {
    md += `## 🏝️ 분리된 클러스터 (${main.components.length}개 컴포넌트, 전체 기준)\n\n`;
    md += `위키가 하나의 연결망이 아닙니다. 브리지 논문 등재(\`discover_backward.js\`로 양 클러스터의 referenced_works 교집합) 권장.\n\n`;
    main.components.slice(0, 8).forEach((comp, i) => {
      md += `### 컴포넌트 ${i + 1} (${comp.length}편)\n`;
      const sample = comp.slice(0, 10).map(id => `\`${id}\``).join(', ');
      md += `${sample}${comp.length > 10 ? `, _...외 ${comp.length - 10}편_` : ''}\n\n`;
    });
    if (main.components.length > 8) md += `_...외 ${main.components.length - 8}개_\n\n`;
  }

  // 5. Bridges
  if (main.bridges.length > 0) {
    md += `## 🌉 브리지 (${main.bridges.length}건, 전체 기준) — 핵심 연결고리\n\n`;
    md += `이 링크가 사라지면 그래프가 끊어집니다. **취약점이자 토대 논문 후보.**\n\n`;
    md += `| 노드 A | 노드 B |\n|---|---|\n`;
    for (const [a, b] of main.bridges.slice(0, 30)) {
      md += `| \`${a}\` | \`${b}\` |\n`;
    }
    if (main.bridges.length > 30) md += `\n_...외 ${main.bridges.length - 30}건_\n`;
    md += `\n`;
  }

  // 6. Hubs
  if (main.hubs.length > 0) {
    md += `## ⭐ 허브 (${main.hubs.length}편, degree ≥ ${HUB_THRESH})\n\n`;
    md += `많은 페이지와 연결됨. overview 동기화 시 우선 인용 후보.\n\n`;
    md += `| Page | Overview? | Degree | In | Out | Category |\n|---|:---:|---:|---:|---:|---|\n`;
    for (const n of main.hubs.slice(0, 20)) {
      md += `| \`${n.id}\` | ${n.isOverview ? '✓' : '-'} | **${n.degree}** | ${n.inDegree} | ${n.outDegree} | ${n.category || '-'} |\n`;
    }
    md += `\n`;
  }

  // 7. Leaves
  if (main.leaves.length > 0) {
    md += `## 🍃 가지 끝 (${main.leaves.length}편, degree = 1)\n\n`;
    md += `<details><summary>전체 ${main.leaves.length}편 펼치기</summary>\n\n`;
    md += `| Page | 유일한 이웃 | Category |\n|---|---|---|\n`;
    for (const n of main.leaves) {
      const neighbor = [...n.outLinks, ...n.inLinks][0] || '-';
      md += `| \`${n.id}\` | \`${neighbor}\` | ${n.category || '-'} |\n`;
    }
    md += `\n</details>\n\n`;
  }

  // 8. Category matrix
  if (matrix.size > 0) {
    md += `## 🗂️ 카테고리 교차 링크 매트릭스\n\n`;
    md += `행=출발, 열=도착. 대각선=카테고리 내부 인용.\n\n`;
    const cats = [...new Set([...matrix.keys()].flatMap(k => k.split('|')))].sort();
    md += `| from \\ to | ${cats.join(' | ')} |\n|---|${cats.map(() => '---:').join('|')}|\n`;
    for (const from of cats) {
      const row = cats.map(to => matrix.get(`${from}|${to}`) || '·');
      md += `| **${from}** | ${row.join(' | ')} |\n`;
    }
    md += `\n_빈 셀(·)이 많다면 카테고리 간 cross-citation 부족 신호._\n\n`;
  }

  // 9. Action checklist
  md += `## ✅ 액션 체크리스트 (사용자 결정)\n\n`;
  if (main.orphans.length > 0) md += `- [ ] 고립 페이지 ${main.orphans.length}편에 \`## Related Papers\` 추가\n`;
  if (danglingLinks.length > 0) md += `- [ ] 깨진 링크 ${danglingLinks.length}건 수정 또는 페이지 등재\n`;
  if (ambiguousLinks.length > 0) md += `- [ ] 모호한 링크 ${ambiguousLinks.length}건 → \`[[category/stem]]\` 풀패스로 변환\n`;
  if (main.components.length > 1) md += `- [ ] 컴포넌트 ${main.components.length}개 → 통합 브리지 논문 등재\n`;
  if (secondary.components.length > main.components.length) md += `- [ ] overview 의존도 점검 — overview 없으면 ${secondary.components.length}개로 쪼개짐\n`;
  if (main.bridges.length > 0) md += `- [ ] 브리지 노드 ${main.bridges.length}건 wiki-verifier 검증 우선순위 격상\n`;
  if (fenceWarnings.length > 0) md += `- [ ] 깨진 코드 블록 ${fenceWarnings.length}개 페이지 markdown 수정\n`;
  if (main.orphans.length === 0 && danglingLinks.length === 0 && main.components.length <= 1 && fenceWarnings.length === 0) {
    md += `- ✅ 그래프 구조 양호.\n`;
  }
  md += `\n---\n\n_재생성 권장: 새 PDF 5편 등재마다 또는 월 1회_\n`;

  fs.writeFileSync(OUT_MD, md);
  console.log(`📝 ${OUT_MD}`);

  if (EMIT_JSON) {
    const jsonOut = {
      generated_at: new Date().toISOString(),
      main: {
        pages: main.pages, links: main.links,
        orphans: main.orphans.map(n => n.id),
        hubs: main.hubs.map(n => ({ id: n.id, degree: n.degree, isOverview: n.isOverview })),
        bridges: main.bridges,
        components: main.components.map(c => c.length),
      },
      secondary: {
        pages: secondary.pages, links: secondary.links,
        orphans: secondary.orphans.map(n => n.id),
        bridges: secondary.bridges,
        components: secondary.components.map(c => c.length),
      },
      danglingLinks,
      ambiguousLinks,
      fenceWarnings,
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(jsonOut, null, 2));
    console.log(`💾 ${OUT_JSON}`);
  }

  console.log(`\n📊 Main:      ${main.pages} pages · ${main.links} links · ${main.orphans.length} orphans · ${main.components.length} components · ${main.bridges.length} bridges`);
  console.log(`📊 Secondary: ${secondary.pages} pages · ${secondary.links} links · ${secondary.orphans.length} orphans · ${secondary.components.length} components · ${secondary.bridges.length} bridges`);
  if (fenceWarnings.length > 0) console.log(`⚠️  ${fenceWarnings.length} pages have unmatched code fences.`);
})();
