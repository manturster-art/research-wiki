# 3-Tier Structure — papers / sources / wiki

## 개념

학술 논문 위키를 **3개의 분리된 계층**으로 관리한다. 각 계층은 **다른 목적·다른 소요시간·다른 독자**를 가진다.

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 3: papers/{stem}.pdf       원본 (immutable)            │
│   • 변하지 않는 ground truth                                  │
│   • 1시간+ 정독 — 특정 수식·표·그림·정확한 인용문이 필요할 때 │
├─────────────────────────────────────────────────────────────┤
│ Tier 2: sources/{stem}.md       7-섹션 상세 요약              │
│   • Claude/사용자가 작성한 구조화 요약                          │
│   • 10분 정독 — 직접 인용할 논문만                            │
│   • 박사연구·프로젝트 위치 + 한국어 요약 포함                  │
├─────────────────────────────────────────────────────────────┤
│ Tier 1: wiki/{category}/{stem}.md  핵심 정리 + 상호참조        │
│   • 가장 압축된 형태 + [[wikilinks]]로 다른 논문 연결         │
│   • 2분 정독 — 항상 여기서 시작                              │
│   • Obsidian 그래프뷰의 노드                                  │
└─────────────────────────────────────────────────────────────┘
```

**핵심 원칙**: 위에서 아래로 갈수록 깊고 느림. **항상 Tier 1부터 읽고 필요한 만큼만 내려간다.** 대부분 논문은 Tier 1에서 끝.

## 파일명 컨벤션

모든 세 계층이 **동일한 `{stem}`을 공유**한다:

```
{first-author-lastname}-{year}-{first-5-title-words}.{ext}
```

### 규칙
- 소문자만 (`Guariso` → `guariso`)
- 공백 → 하이픈 (`Difference in differences` → `difference-in-differences`)
- 특수문자 제거 (`'`, `.`, `,`, `:`, `&`, parens 등)
- 연도는 4자리 (출판 연도; accepted-manuscript 연도와 다르면 ★ 주의 — `references/d16-anti-hallucination.md` 참조)
- 5개 단어 (관사 `the/a/an` 포함, 그러나 stop word 제거가 의미를 해치면 그대로 유지)
- 컨소시엄/기관 저자: 기관 약칭 사용 (예: `un-habitat`, `oecd`, `lg-ai-research`, `ibec`)

### 예시
| 원본 | stem |
|---|---|
| Guariso, D., Guerrero, O. A., & Castañeda, G. (2023). Automatic SDG budget tagging: Building public financial management capacity through natural language processing. | `guariso-2023-automatic-sdg-budget-tagging-building` |
| Callaway, B., & Sant'Anna, P. H. C. (2021). Difference-in-Differences with Multiple Time Periods. | `callaway-2021-difference-in-differences-with-multiple` |
| LG AI Research (2026). EXAONE 4.5 Technical Report. | `lg-ai-research-2026-exaone-4-5-technical` |
| 자치체ＳＤＧｓ推進評価・調査検討会 (2019). 地方創生ＳＤＧｓローカル指標リスト. | `ibec-2019-local-sdgs-indicator-list-japan` |

## 카테고리 (wiki/ 하위)

- **5~10개 카테고리** 권장 (적으면 큰 카테고리에 너무 많이 쌓이고, 많으면 분류 노이즈)
- **방법론 기준 분류**가 주제 기준보다 우월 (Karpathy 원칙) — "panel-causal-methods"가 "sdg-13-climate" 보다 재사용 가능
- 시작 시 카테고리 ≈ 500편 넘으면 분리 검토
- 표준 카테고리 (분야 무관): `concepts`, `overviews`, `other`
- 도메인 특화 카테고리 사용자 결정 (예: 본 위키는 `sdg-classification-nlp`, `sdg-localization`, `budget-tagging`, `panel-causal-methods`, `annotation-iaa`)

## 폴더 구조 (전체)

```
{wiki-root}/
├── CLAUDE.md                    # 시스템 규칙 + Karpathy 4 Rules + D16 + 카테고리
├── HOW-TO-USE.md                # 논문을 어떻게 읽나
├── SETUP-NEW-PC.md              # 다른 PC 설정 + Git 백업
├── MOC.md                       # Dataview 기반 대시보드
├── index.md                     # 카테고리별 색인
├── .gitignore
├── .obsidian/                   # Obsidian 설정 (snippet은 공유, workspace.json은 PC별)
├── papers/                      # PDF 원본 (immutable, cp only — never symlink)
├── sources/                     # 7-섹션 상세 요약
├── wiki/                        # 핵심 정리 + 상호참조
│   ├── overviews/              # 종합 페이지 (지식 복합화 — 가장 가치 있음)
│   ├── concepts/               # 일반 방법론·이론 설명
│   ├── other/                  # 분류 애매한 것
│   └── {도메인 카테고리들}/
├── _workspace/                  # 검증·발견 도구
│   ├── openalex_helper.js
│   ├── crossref_helper.js
│   ├── enrich_wiki.js
│   ├── audit_titles.js
│   ├── find_missing_pdfs.js
│   ├── discover_backward.js
│   ├── discover_related.js
│   ├── .env                    # 보안 — gitignored
│   ├── .env.example
│   ├── .openalex_cache/        # 30일 TTL — gitignored
│   └── .crossref_cache/        # gitignored
└── .claude/
    └── agents/
        └── wiki-verifier.md    # 4-way 검증 에이전트 (프로젝트 로컬)
```

## Tier 2 (sources/) — 7 섹션 표준

```markdown
---
{YAML frontmatter — yaml-conventions.md 참조}
---

## One-line Summary
한 문장으로 논문의 핵심 발견·기여.

## 1. Document Information
저널·연도·DOI·페이지·OA 출처·저자 소속 등 메타데이터.

## 2. Key Contributions
1~5개 번호 매긴 핵심 기여.

## 3. Methodology and Architecture
방법론 상세 — 데이터·모델·알고리즘·평가 설계.

## 4. Key Results and Benchmarks
주요 결과 + 구체적 수치.

## 5. Limitations and Future Work
★ 가장 중요 — 본인 연구의 차별화 지점이 여기서 나옴.

## 6. Related Work
이 논문이 인용한 핵심 선행연구 + wiki 내 [[wikilinks]].

## 7. Glossary
이 논문 특유의 용어·약어 정리.

## 한국어 요약
**핵심 한 줄**: ...
**박사 시리즈 위치 (또는 본 프로젝트 위치)**: ...
**핵심 시사점**: ...
```

## Tier 1 (wiki/) — 압축 정리

```markdown
---
{YAML frontmatter}
---

## Summary
영문 정본 한 문장 (인용문 후보).

## Key Contributions
3~5개 bullet.

## Methodology and Architecture
2~4개 bullet (방법 압축).

## Results
2~4개 bullet (결과 압축).

## Related Papers
- [[category/wikilink]] — 관계 설명
- [[category/wikilink]] — 관계 설명

## 한국어 요약
**핵심 한 줄**: ...
**박사 시리즈/프로젝트 위치**: ...
```

## 메타 페이지 (overviews/)

지식 복합화의 핵심. 여러 논문을 묶어 종합한 페이지:
- **{프로젝트} 시리즈 허브** — 모든 참고문헌의 진입점
- **{측정 스택}** — 같은 도메인 다층 논문을 묶음 (예: SDG 측정 = 지표 ↔ 분류 ↔ 예산태깅)
- **{Canvas 시각 맵}** — `.canvas` 파일로 논문 간 관계 그래프

→ 좋은 답변이 나왔을 때 "이거 overview 페이지로 만들어줘" 요청이 지식 자산화의 핵심.

## PDF 관리 규칙

- **언제나 cp, never symlink** — `papers/`는 immutable
- `pdf_path` YAML 필드: **상대경로** (`papers/{stem}.pdf`) — Google Drive 등 PC 간 이동 안전
- `pdf_filename`: 항상 `basename(pdf_path)`
- 원본 외부 경로는 `papers/`로 복사 후 영원히 잊는다 (`~/Downloads/`에 두지 않음)
