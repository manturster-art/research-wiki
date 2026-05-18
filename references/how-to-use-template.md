# HOW-TO-USE.md Template

위키 루트에 install. 도메인·프로젝트명만 `{PLACEHOLDER}` 치환.

---

```markdown
# 위키 사용법 — 논문을 어떻게 보는가

> 이 위키를 **만드는 것**과 **쓰는 것**은 다른 기술입니다. 이 문서는 "쓰는 법"을 정리한 개인용 가이드입니다.
> 관련 문서: [[CLAUDE]] (시스템 규칙) · [[index]] (전체 색인) · [[MOC]] (대시보드) · [[overviews/{PROJECT_HUB}]] (프로젝트 허브)

---

## 핵심 원칙: PDF부터 읽지 않는다

이 위키는 **3계층(3-tier)** 구조입니다. 각 계층은 **읽는 목적이 다릅니다.**

\`\`\`
papers/{stem}.pdf      ← 원본 (1시간+)   "특정 수식·표·그림이 필요할 때만"
   ↑
sources/{stem}.md      ← 상세 요약 (10분) "직접 인용할 논문만"
   ↑
wiki/{category}/{stem}.md  ← 핵심 정리 (2분) "★ 항상 여기서 시작"
\`\`\`

대부분의 논문은 **wiki만 읽고 끝납니다.** 직접 인용할 3~4편만 source까지, 핵심 1~2편만 PDF까지 내려갑니다.

---

## 계층별 읽기 — 언제 무엇을

| 계층 | 파일 위치 | 언제 읽나 | 소요 | 무엇을 얻나 |
|---|---|---|---|---|
| **wiki** | `wiki/{category}/{stem}.md` | 항상 여기서 시작 | 2분 | 핵심 주장 + 프로젝트 위치 + 관련 논문 링크 |
| **sources** | `sources/{stem}.md` | wiki 보고 "더 봐야겠다" 싶을 때 | 10분 | 7섹션 상세 — 방법론·결과·한계·용어 |
| **papers** | `papers/{stem}.pdf` | source로도 부족할 때만 | 1시간+ | 원본 수식·표·그림·부록 |

---

## 논문 한 편 보는 루틴 (실전)

### 1단계 — wiki 페이지 (2분)

읽는 순서:
1. **맨 위 YAML `paper:` 필드** → "내 어느 산출물에 쓰나?"
2. **`## 한국어 요약`을 먼저** → 30초 만에 핵심 파악 (영어 only 모드면 Summary)
3. **`## Summary` 한 줄** → 인용문 후보
4. **`## Related Papers`의 `[[링크]]`** → "이거랑 묶이는 논문이 뭐지?"

### 2단계 — 판단

- "이건 배경 지식이다" → **끝.** wiki 내용만 기억하고 넘어감
- "이건 직접 인용한다" → source로 내려감

### 3단계 — source 페이지 (필요시 10분)

읽는 우선순위:
1. **`## 2. Key Contributions`** → 인용할 때 쓸 핵심 주장
2. **`## 5. Limitations and Future Work`** → ★ **내 연구가 차별화되는 지점** (제일 중요!)
3. **`## 한국어 요약`의 "프로젝트 위치"** → 이미 정리해둔 "이 논문을 어디에 어떻게 쓸지"
4. (필요시) `## 3. Methodology` → 방법론을 차용·비교할 때

### 4단계 — PDF (드물게)

- source의 특정 수치·표·그림이 필요할 때만
- 직접 인용 문장을 원문에서 확인할 때

---

## Obsidian으로 보는 법

1. **`Ctrl+O` → `MOC` 입력** → 대시보드부터
2. **아무 wiki 페이지 열고 → 우측 Backlinks 패널** → "이 논문을 인용하는 다른 위키 페이지"
3. **`Ctrl+G` 그래프 뷰** → 논문 간 연결망. 중심에 많이 연결된 게 핵심 논문
4. **`[[링크]]` 클릭** → 관련 논문 타고 다니기
5. **`Ctrl+Shift+F` 전체 검색** → 한국어 요약 + 영문 본문 동시 검색

---

## 의심하는 습관 (D16 원칙)

위키 요약은 **PDF 직접 추출 기반이지만 완벽하지 않습니다.** 다음을 습관화하세요:

- wiki/source에 **`★ 메타데이터 정정`** 또는 **`★ 주의`** 표시 → 그 부분은 꼭 PDF 확인
- **직접 인용할 논문**은 → 반드시 source의 `## 1. Document Information` 메타데이터를 **PDF 첫 페이지와 대조**
- 의심되면 → 정본 확인:
  \`\`\`
  node _workspace/openalex_helper.js doi <DOI>
  \`\`\`

---

## 검증 도구 (`_workspace/`)

| 명령 | 용도 | 언제 |
|---|---|---|
| `node _workspace/openalex_helper.js doi <DOI>` | 단건 정본 확인 | 의심될 때 |
| `node _workspace/crossref_helper.js doi <DOI>` | Crossref 정본 확인 | OpenAlex와 비교 |
| `node _workspace/crossref_helper.js crosscheck <DOI>` | **두 DB 동시 + 자동 비교** | 의심·정정 후 |
| `node _workspace/enrich_wiki.js` | 전체 위키 OpenAlex 대조 | 월 1회 |
| `node _workspace/audit_titles.js` | 제목 정본 대조 | 새 PDF 등재 후 |
| `node _workspace/find_missing_pdfs.js` | 우선 미입수 PDF의 OA URL 탐색 | 논문 더 필요할 때 |
| `node _workspace/discover_backward.js` | 시드 논문의 이론 토대 발견 | 배경 채울 때 |

> `audit_titles.js`의 "불일치" 결과 중 DOI 없는 항목(title-search)은 가짜 양성 가능 — DOI 기반만 신뢰.

## 검증 에이전트 (`wiki-verifier`)

4-way 검증(wiki YAML ↔ OpenAlex ↔ Crossref ↔ PDF 1쪽) 자동 수행 에이전트.
- 정의: `.claude/agents/wiki-verifier.md`
- 산출물: `_workspace/verification_log.md` (append-only)
- **wiki 파일 자동 수정 금지** — ★ 표시·메타데이터 정정은 사용자가 로그 검토 후 직접 결정
- 호출: *"Krippendorff 항목 wiki-verifier로 검증해줘"* 같이 자연어로

---

## 시작 루틴 제안

### 처음: 프로젝트 직결 5편 정독
- {PROJECT_PRIMARY_PAPER_1}
- {PROJECT_PRIMARY_PAPER_2}
- {PROJECT_PRIMARY_PAPER_3}
- [[overviews/{PROJECT_HUB}]] — 전체 그림

### 그다음: 능동적 위키 만들기

새 논문 추가/기존 논문 읽을 때마다:
1. wiki 페이지를 한 번 읽고
2. **본인 말로 한 줄 코멘트**를 `## 한국어 요약` 아래에 덧붙이기
   \`\`\`markdown
   ### 내 메모 (YYYY-MM-DD)
   - {프로젝트} §X에서 활용 시: ...
   \`\`\`

→ "Claude가 만든 위키"에서 **"내 위키"로 전환**되는 과정.

---

## 한 장 요약

\`\`\`
1. wiki/ 부터 읽는다 (2분)          → 한국어 요약 + paper 필드
2. 필요하면 sources/ 로 (10분)      → Key Contributions + Limitations
3. 정말 필요할 때만 papers/ (1시간) → 원본 수식·표
4. ★ 표시는 PDF 직접 확인
5. 직접 인용은 메타데이터 PDF 대조
6. 읽고 나면 "내 메모" 한 줄 추가
\`\`\`
```
