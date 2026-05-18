# CLAUDE.md Template (신규 위키 부트스트랩 시 install)

아래 마크다운을 신규 위키 루트의 `CLAUDE.md`로 저장. `{PLACEHOLDER}`를 사용자 입력으로 치환.

---

```markdown
# LLM Wiki — \[{FIELD_NAME}]

A personal knowledge base of {FIELD_NAME} papers, following [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/1dd0294ef9567971c1e4348a90d69285):

```
Original PDF → sources/*.md (LLM summary) → wiki/{category}/*.md (final page)
```

**Language policy**: Primary language is **English** (RAG-friendly). Every `sources/` and `wiki/` file MUST also include a **`## 한국어 요약`** section as the final block — concise Korean summary covering one-line gist + key contributions + project-specific relevance. Conversation can be in any language.

> English-only 모드인 경우 위 정책 줄을 다음으로 교체:
> **Language policy**: All wiki content is in English. Conversation can be in any language.

---

## THE FOUR RULES (do not violate)

These rules are the core of the system. They prevent hallucination and keep every claim traceable.

1. **No web search.** Never use `WebSearch` or `WebFetch` to fill gaps. The point of this wiki is that every answer is grounded in papers we actually have.
2. **Answer from the wiki first.** Use `sources/` and `wiki/` as the only sources of truth.
3. **If the wiki is insufficient, re-read the PDF.** Go to `papers/{author}-{year}-{words}.pdf` and extract more detail with `pypdf`. Then update the wiki.
4. **If the wiki has no paper on the topic, say so.** Tell the user *"I don't have a paper on this — please give me the PDF."* Do not improvise.

These rules apply to **every** response, including overview pages: cite only papers that exist in the wiki.

---

## Repository Structure

\`\`\`
your-llm-wiki/
├── CLAUDE.md                # This file
├── HOW-TO-USE.md            # 논문 읽는 3계층 루틴
├── SETUP-NEW-PC.md          # 멀티PC + Git 백업 가이드
├── MOC.md                   # Dataview 기반 대시보드
├── index.md                 # 카테고리별 색인
├── papers/                  # Original PDFs (cp, never symlink)
├── sources/                 # PDF summaries (7-section + Korean)
├── wiki/                    # Wiki pages (compact + Korean)
│   ├── {category}/
│   └── overviews/           # 종합 페이지 (지식 복합화)
├── _workspace/              # OpenAlex/Crossref 검증 도구
│   ├── openalex_helper.js
│   ├── crossref_helper.js
│   ├── enrich_wiki.js
│   ├── audit_titles.js
│   ├── find_missing_pdfs.js
│   ├── discover_backward.js
│   ├── discover_related.js
│   ├── .env                 # OPENALEX_KEY (gitignored)
│   └── .env.example
└── .claude/
    └── agents/
        └── wiki-verifier.md # 4-way 검증 에이전트
\`\`\`

## File Naming Convention

All three tiers (PDF, source, wiki) share the same stem:

\`\`\`
{first-author-lastname}-{year}-{first-5-title-words}.{ext}
\`\`\`

* Lowercase, special chars stripped, spaces → `-`
* Year is 4 digits (출판 연도 — accepted manuscript와 다르면 ★ 주의)
* Consortium papers: use consortium name (e.g. `un-habitat-2025-...`)

## Categories

| Category | Includes |
|---|---|
| `{CATEGORY_1}` | {description} |
| `{CATEGORY_2}` | {description} |
| `{CATEGORY_3}` | {description} |
| `concepts` | Key methods/theories explained generically |
| `overviews` | Synthesis pages spanning multiple papers (★ 지식 복합화 핵심) |
| `other` | Cross-cutting, miscellaneous |

Tip: classify by **method**, not topic. A methylation paper studying a phenotype goes to `methylation` (or your method-aligned category), not the phenotype's category.

## Project Mapping ({PROJECT_NAME})

Each paper carries a `paper:` YAML field linking it to project structure:

| `paper:` value | Refers to |
|---|---|
| `{PAPER_1_CODE}` | {PAPER_1_DESCRIPTION} |
| `{PAPER_2_CODE}` | {PAPER_2_DESCRIPTION} |
| `background` | Useful context but not directly cited |

A reference may belong to multiple papers, e.g., `paper: [1, 2]`.

---

## Adding a New Paper

### Step 1 — Copy PDF to `papers/` and extract text

\`\`\`bash
pip3 install pypdf

python3 -c "
import pypdf, sys
reader = pypdf.PdfReader(sys.argv[1])
text = ''
for page in reader.pages[:15]:
    t = page.extract_text()
    if t: text += t + '\n'
    if len(text) > 12000: break
print(text[:12000])
" "/path/to/paper.pdf"
\`\`\`

### Step 2 — Write `sources/{stem}.md`

\`\`\`yaml
---
title: "Paper Title"
authors: Author List
year: YYYY
doi: DOI
category: <one of the categories above>
paper: [1, 2]
ref_code: "optional external ref list code"
pdf_path: papers/{stem}.pdf
pdf_filename: {stem}.pdf
source_collection: external
---

## One-line Summary
## 1. Document Information
## 2. Key Contributions
## 3. Methodology and Architecture
## 4. Key Results and Benchmarks
## 5. Limitations and Future Work
## 6. Related Work
## 7. Glossary
## 한국어 요약
\`\`\`

### Step 3 — Write `wiki/{category}/{stem}.md`

\`\`\`yaml
---
title: "Paper Title"
authors: Author list
year: YYYY
doi: DOI
source: {stem}.md
category: <one of the categories above>
paper: [1, 2]
ref_code: "optional"
pdf_path: papers/{stem}.pdf
pdf_filename: {stem}.pdf
source_collection: external
tags: []
---

## Summary
## Key Contributions
## Methodology and Architecture
## Results
## Related Papers
- [[category/page]] — relationship
## 한국어 요약
\`\`\`

### Step 4 — Update `index.md`

Add a one-line entry under the right category.

---

## PDF Management Rules

* **Always copy, never symlink.** `cp` from external locations into `papers/`.
* `pdf_path`: **relative** (`papers/{stem}.pdf`) — Google Drive 등 PC 간 이동 안전.
* `pdf_filename` must match `basename(pdf_path)`.

## Knowledge Compounding

The most valuable pages are not individual paper summaries — they are `wiki/overviews/` pages that synthesize across papers. When a question is answered well, save the answer:

> "Save this as an overview page in `wiki/overviews/`"

Each conversation should produce 5–15 new or updated wiki pages. Over time the wiki becomes a searchable, cross-referenced knowledge graph that future conversations draw from.

## Browsing with Obsidian

Open the wiki folder as a Vault. Native support for `[[wikilinks]]`, graph view, full-text search. Install:
- **Dataview** plugin (MOC.md 자동 표 렌더링 — 필수)
- CSS snippet: `.obsidian/snippets/phd-wiki.css` 활성화

---

## Design Principles

* **3-tier**: Raw PDF (immutable) → sources/*.md → wiki/\*\*/*.md
* **English primary + Korean summary**: every file ends with `## 한국어 요약`
* **Obsidian compatible**: `[[wikilinks]]`, plain markdown
* **Consistent YAML**: every file has title, authors, year, doi, category, **paper**, pdf_path, pdf_filename, source_collection
* **Project traceability**: `paper:` field maps every reference to project structure
* **No hallucinated citations** (D16 principle): metadata extracted directly from PDF; if uncertain, mark `?` and note in Limitations
* **No web search**: rule #1 above

When in doubt, follow rule #1.

***

## OpenAlex Pattern B Verification (D16 enforcement layer)

For metadata verification and missing-PDF discovery, the wiki uses **OpenAlex Pattern B**. This is the ONLY exception to Rule #1 — used for *metadata verification + PDF discovery*, not for filling answer content.

### Setup (one-time)
\`\`\`bash
# Get free OpenAlex API key (30 sec): https://openalex.org/settings/api
cp _workspace/.env.example _workspace/.env
# Edit _workspace/.env → set OPENALEX_KEY=...
node _workspace/openalex_helper.js diagnose
\`\`\`

### Workflow
| Command | Purpose |
|---|---|
| `node _workspace/enrich_wiki.js` | Verify all wiki entries; drift + OA URLs + missing DOIs |
| `node _workspace/audit_titles.js` | Strict title comparison vs OpenAlex canonical |
| `node _workspace/find_missing_pdfs.js` | OA URL discovery for priority missing PDFs |
| `node _workspace/discover_backward.js` | Theoretical foundations (referenced_works) |
| `node _workspace/openalex_helper.js doi <DOI>` | Single DOI verify (CLI) |

### When to run
- **Before adding a new wiki entry**: `verifyByDOI` — confirm citation exists; capture W-ID
- **Periodically (monthly)**: `enrich_wiki.js` — drift detection
- **When user asks for missing PDFs**: `find_missing_pdfs.js`

---

*위 템플릿을 사용자 분야·프로젝트에 맞춰 customize 후 위키 루트의 CLAUDE.md로 저장*
```
