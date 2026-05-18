# YAML Frontmatter Conventions

모든 wiki/ + sources/ 파일은 다음 YAML frontmatter를 가진다.

## 필수 필드

```yaml
---
title: "정본 제목 (OpenAlex/PDF 직접 추출 — 임의 축약 금지)"
authors: "First Last, Second Last, Third Last (Lastname, 첫이름 포맷 또는 First Last 자유 — 일관성만 유지)"
year: 2023                              # 출판 연도 (accepted-manuscript와 다르면 ★ 주의)
doi: "10.1017/dap.2023.28"              # DOI 없으면 빈 문자열 ""
category: budget-tagging                # wiki/ 하위 폴더명과 일치
paper: [1, 2]                           # 박사논문/프로젝트 매핑 (아래 표 참조)
ref_code: "paper1 B-1 / paper2 R"       # 외부 참고문헌 리스트의 코드 (선택)
pdf_path: papers/{stem}.pdf             # 상대경로 권장 (절대경로는 PC 종속)
pdf_filename: {stem}.pdf
source_collection: external             # external / synthesis(overview) / etc.
---
```

## `paper:` 필드 — 프로젝트 매핑 규약

`paper:` 필드는 이 참고문헌이 어느 산출물에 인용/사용되는지를 추적한다. **본인 프로젝트에 맞춰 customize.**

본 시스템(SDGs 박사연구)의 예:
```yaml
paper: [1]           # Paper 1 (AI 분류기)에만 인용
paper: [1, 2]        # Paper 1과 Paper 2 둘 다
paper: [separate]    # 별도논문 (학위 외)
paper: [background]  # 직접 인용은 아니나 배경 지식
paper: [1, background]  # Paper 1에 사용 + 추가 배경
```

다른 프로젝트라면:
```yaml
paper: [thesis]      # 학위논문 단일
paper: [ch3, ch5]    # 학위논문 3장·5장
paper: [grant-NSF]   # 특정 grant proposal
paper: [conf-NeurIPS-2026]  # 특정 컨퍼런스 투고
```

→ Dataview에서 `WHERE contains(paper, 1)` 같이 자동 필터 가능.

## `ref_code:` 필드 — 외부 참고문헌 리스트 코드 (선택)

기존에 작성한 참고문헌 리스트(예: `paper1_참고문헌_리스트_v7.docx`의 A-1, B-5 등) 코드를 그대로 적어두면, 위키와 원본 리스트가 양방향 추적 가능.

## OpenAlex 검증 필드 (선택)

`enrich_wiki.js` 실행 후 자동/수동 추가:

```yaml
openalex_id: "W4387120445"      # OpenAlex Work ID
cited_by_count: 14               # 검증 시점 스냅샷
last_oa_verified: 2026-05-13     # 다음 재검증 시점 판단
```

→ "인용 수 정렬", "검증 90일 초과" 같은 Dataview 쿼리 가능.

## `tags:` 필드 (wiki/ 전용, 선택)

```yaml
tags: [sdg-budget-tagging, b4sdgs, nlp, paper1-B1, paper2-R, dissertation-core-model]
```

- 자동화된 필터링용
- CSS snippet으로 색상 코딩 가능 (paper1-* = 파랑, separate-* = 빨강 등)
- 검증 상태 태그: `metadata-corrected`, `year-corrected`, `co-cited-seed` 등

## `source:` 필드 (wiki/ 전용)

wiki/ 페이지는 항상 source/ 파일을 가리킴:
```yaml
source: guariso-2023-automatic-sdg-budget-tagging-building.md
```

## 절대 금지

- **임의 축약 제목**: "SDG-Meter: Deep Learning Tool" ❌ → 정본 그대로 "SDG-Meter: A Deep Learning Based Tool for Automatic Text Classification of the Sustainable Development Goals" ✅
- **추정 저자**: PDF에 없는 저자 추가, 또는 OpenAlex 검색 결과를 PDF 확인 없이 신뢰
- **출판 연도 vs accepted manuscript 혼동**: 양쪽이 다르면 `★ 연도 주의` 섹션을 source에 명시하고 출판본 연도 사용 (예: Allen et al. 2018 accepted → 2019 published)
- **존재하지 않는 DOI**: 모르면 `doi: ""`. 추정 X.

## YAML 문법 주의

- 값에 `:` `[` `]` `{` `}` `"` `'` 포함 시 큰따옴표로 감싸기
- 한글 OK, 이모지 OK
- list는 `[a, b, c]` 또는 줄별 `- a` 둘 다 가능 (일관성 유지)
- 빈 값은 `""` 또는 `[]` (필드 자체 삭제 X — 다른 도구가 기대함)
