# research-wiki — Claude Code Skill

학술 논문 LLM 위키 구축·유지·검증을 위한 Claude Code Skill.
[Karpathy의 LLM Wiki 패턴](https://gist.github.com/karpathy/1dd0294ef9567971c1e4348a90d69285)을
박사연구·장기 학술 프로젝트용으로 강화한 메타 스킬.

## 무엇이 다른가

| 기능 | 일반 LLM 위키 | research-wiki |
|---|---|---|
| 메타데이터 검증 | LLM 자동 생성 (할루시네이션 위험) | **OpenAlex + Crossref + PDF 4-way cross-check** |
| 인용 무결성 | LLM 판단 | **D16 anti-hallucination** — 자동 수정 금지, 모든 정정은 사용자 결정 |
| 다국어 | UI만 i18n | **English primary + 한국어 요약** (RAG-friendly + 한국 연구자 친화) |
| 프로젝트 추적 | 없음 | YAML `paper:` 필드로 학위논문/투고논문/배경 매핑 |
| 그래프 분석 | 없음 | `graph_insights.js` — orphan/bridge/component 자동 탐지 |
| 검증 캐시 | 매번 API 호출 | SHA256 + 30-day TTL — 변경된 항목만 재검증 |

## 설치

이 repo를 사용자 Claude 설정 디렉토리 아래 skill 폴더로 clone:

```bash
# Windows
cd %USERPROFILE%\.claude\skills
git clone https://github.com/manturster-art/research-wiki.git

# macOS/Linux
cd ~/.claude/skills
git clone https://github.com/manturster-art/research-wiki.git
```

Claude Code 재시작 후 `/research-wiki` 트리거 가능.

## 5가지 시나리오

| 시나리오 | 자연어 트리거 예 |
|---|---|
| **A. Bootstrap** | "논문 위키 만들어줘 분야는 X" |
| **B. Add PDF** | "이 PDF들 위키에 추가해줘" |
| **C. Verify** | "위키 메타데이터 검증해줘" / "제목 정본 대조" |
| **D. Discover** | "이 논문이 인용한 토대 논문 찾아줘" (backward citation) |
| **E. Download** | "OA PDF 자동으로 받아줘" |

자세한 명세는 [`skill.md`](skill.md) 참조.

## 3-tier 구조 (Karpathy 패턴 강화판)

```
papers/{stem}.pdf              ← 원본 (immutable)
sources/{stem}.md              ← 7섹션 상세 요약 + 한국어 요약
wiki/{category}/{stem}.md      ← 핵심 정리 + Related Papers + 한국어 요약
```

`{stem}` = `{first-author-lastname}-{year}-{first-5-title-words}` (lowercase, hyphenated)

## 의존성

- [Claude Code](https://claude.com/claude-code) (필수)
- Node.js v20+ (검증 스크립트 실행)
- Python 3.10+ with `pypdf` (PDF 추출)
- [Obsidian](https://obsidian.md/) (위키 브라우징, 선택)
- [OpenAlex API key](https://openalex.org/settings/api) (무료, 30초 발급)

## D16 Anti-Hallucination 원칙

1. **No web search** — 모든 답변은 위키 내 PDF 기반
2. **Answer from wiki first** — sources/ + wiki/가 단일 진실 출처
3. **Re-read PDF if needed** — 위키 부족 시 papers/{stem}.pdf로 회귀
4. **Admit if no PDF** — 없으면 "PDF 주세요" 답변, 절대 즉흥 X

자세히: [`references/d16-anti-hallucination.md`](references/d16-anti-hallucination.md)

## nashsu/llm_wiki와의 차이

[`nashsu/llm_wiki`](https://github.com/nashsu/llm_wiki) (7.8k★)는 Tauri 데스크톱 앱으로 LLM이 자동 synthesis. 본 스킬은 **정반대 철학** — 사람이 큐레이션, LLM은 보조, 정본 DB가 검증. 학술 인용 무결성이 최우선인 경우 본 스킬이 적합.

본 스킬은 nashsu의 다음 발상은 D16 위배 없이 차용:
- Knowledge Graph Insights → `graph_insights.js`
- Review queue (async human-in-the-loop) → `wiki-verifier`의 dual-write 정책
- SHA256 incremental cache → `enrich_wiki.js`

## License

MIT.

## Credits

- 디자인: Andrej Karpathy ([gist 원본](https://gist.github.com/karpathy/1dd0294ef9567971c1e4348a90d69285))
- 박사연구 워크플로우 적응 + D16 검증 레이어: 박정진
- Claude Code Skill 패키징: Claude
