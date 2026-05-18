# SETUP-NEW-PC.md Template

위키 루트에 install. Git URL·계정 정보는 사용자가 첫 백업 후 채움.

---

```markdown
# 다른 PC에서 이어 쓰기 — 설정 가이드

> 이 위키 + Claude Code + OpenAlex 도구를 새 PC에서도 동일하게 쓰기 위한 체크리스트.
> 핵심 분리: **(1) 위키 동기화** · **(2) 도구 환경 재구성** · **(3) Claude와 대화 이어가기**

---

## 0. 먼저 알아야 할 것

| 무엇 | 어떻게 이동되나 | 자동? |
|---|---|---|
| 위키 파일 (papers/sources/wiki/*.md) | 파일 동기화 (Git·OneDrive 등) | 사용자 설정 |
| 도구 (Claude Code, Python, Node, Obsidian) | 새 PC에 설치 | 수동 |
| API 키 (OpenAlex) | `.env` 파일 동기화 (단 안전하게) | 수동 |
| **Claude와의 대화 기록** | ❌ **PC별 로컬, 자동 동기화 없음** | 불가 |
| Claude의 "기억" | CLAUDE.md + 위키 자체가 곧 기억 | 자동 (위키 동기화 시) |

**핵심**: Claude는 새 PC에서 새 세션이 됨. 그러나 **CLAUDE.md + index.md + MOC.md + overview**를 읽으면 1~2분 안에 프로젝트 맥락을 100% 복원. **위키 자체가 Claude의 기억**.

---

## ⚡ 현재 백업 상태 (사용자가 첫 git push 후 채울 것)

| 항목 | 값 |
|---|---|
| **GitHub repo** | {GITHUB_URL_HERE} (**private** 권장) |
| **현재 브랜치** | `main` |
| **사용 계정** | {GITHUB_ACCOUNT} |
| **이중 동기화** | {Google Drive/OneDrive/Dropbox}(자동) + Git(수동, 월 1회) |
| **`pdf_path` 형식** | 상대경로(`papers/{stem}.pdf`) — PC 간 이동 안전 |

### 새 PC 빠른 시작 (5분)
\`\`\`bash
git clone {GITHUB_URL_HERE}
cd {wiki-folder}
# _workspace/.env 만들기 — 아래 §3 참고
node _workspace/openalex_helper.js diagnose
# 그다음 Obsidian으로 폴더 열기
\`\`\`

---

## 🔁 일상 백업 루틴 (월 1회 권장)

\`\`\`bash
cd {wiki-folder}
git status                          # 변경 확인
git add .
git commit -m "Add 5 new PDFs ({category})"   # 의미 있는 메시지
git push                            # GitHub로 푸시
\`\`\`

**좋은 커밋 메시지 예**:
- ✅ "Add Mildenberger 2020 + Konisky-Woods 2012 to political-institutional"
- ✅ "Fix SDG-Meter title to canonical (D16 정정)"
- ❌ "update" / "fix" (한 달 후 무슨 변경인지 모름)

### 다른 PC에서 이어 쓸 때
\`\`\`bash
git pull              # 변경 가져오기
# ... 작업 ...
git add . && git commit -m "..." && git push
\`\`\`

---

## ⚠️ Drive ↔ Git 동시 사용 5대 주의

1. **한 번에 한 PC에서만 git 명령 사용**
2. **`git push` → 다른 PC 가서 `git pull`** 순서 지키기
3. **Drive 충돌 사본** 생기면 → git을 진실 출처로, 충돌 사본 삭제
4. **`.git/` 폴더는 Drive 동기화됨** (정상)
5. **두 PC에서 동시 git 명령 절대 금지**

---

## 1. 위키 동기화 — 3가지 옵션

### 🅰 Git + GitHub (강추 — 버전 관리 + 멀티PC)

**최초 설정**:
\`\`\`bash
cd {wiki-folder}
git init -b main
git add .
git commit -m "Initial wiki snapshot"
gh repo create {wiki-name} --private --source=. --remote=origin --push
\`\`\`

`.gitignore` 핵심 제외:
- `_workspace/.env` — API 키 (절대 안 올라감)
- `_workspace/.openalex_cache/` `_workspace/.crossref_cache/` — 캐시
- `.obsidian/workspace.json` — PC별 레이아웃

### 🅱 OneDrive · Google Drive · Dropbox

폴더 통째로 동기화 폴더에 두면 끝. **`_workspace/.env`만 동기화 제외** (보안). **`.git/`은 동기화돼도 OK** (~10-20MB).

### 🅒 USB · 외장하드 (수동)

연구실·집 둘만 쓰면. `robocopy` 또는 단순 복사.

---

## 2. 새 PC 도구 설치 체크리스트

### 필수
- [ ] **Claude Code** — https://claude.com/claude-code
- [ ] **Obsidian** — https://obsidian.md (위키 브라우징)
- [ ] **Node.js** v20+ — https://nodejs.org

### 위키 도구
- [ ] **Anaconda Python** (또는 `pip install pypdf python-docx openpyxl`)

### Obsidian 플러그인
- [ ] **Dataview** (MOC.md 표 — 필수)
- [ ] Settings → Appearance → CSS snippets → 프로젝트별 CSS 활성화

---

## 3. OpenAlex `.env` 재구성 (보안 주의)

`.env`는 Git에 안 올라가므로 새 PC에서 따로 만들기.

**옵션 A — 비밀번호 매니저** (강추): 1Password/Bitwarden에 OPENALEX_KEY 저장
**옵션 B — 키 재발급** (가장 깔끔): https://openalex.org/settings/api 에서 새 키 (무료)
**옵션 C — 그냥 둠**: Google Drive 본인 계정 신뢰, 키 노출 시 즉시 재발급

\`\`\`
OPENALEX_KEY=<여기에 키>
OPENALEX_MAILTO=your@email.com
\`\`\`

확인:
\`\`\`bash
node _workspace/openalex_helper.js diagnose
# → has_api_key: true
\`\`\`

---

## 4. Claude와 대화 이어가기 — 핵심

새 PC의 새 세션 첫 메시지:

\`\`\`
이 프로젝트의 컨텍스트를 파악해줘. 다음을 순서대로 읽어:
1. CLAUDE.md
2. HOW-TO-USE.md
3. MOC.md
4. wiki/overviews/{PROJECT_HUB}.md
5. index.md

읽은 후 (a) 프로젝트 구조, (b) 위키 현황(편수·카테고리), 
(c) 사용 가능한 _workspace/ 도구, (d) 알려진 이슈(★ 표시)를 요약해줘.
\`\`\`

→ Claude는 이 5개 파일만 읽으면 **동일한 수준의 맥락**을 갖게 됨.

### 대화 이력 보존
중요한 결정·발견은 **그 자리에서 위키 파일에 반영**. 위키에 박힌 정보는 영구. 대화는 휘발.

---

## 5. 경로 호환성 — 이미 처리됨

위키의 모든 `pdf_path`가 **상대경로**(`papers/{stem}.pdf`)이므로 PC 간 이동 안전. 절대경로로 회귀하지 말 것.

---

## 6. 새 PC 첫 30분 — 단계별 실행

\`\`\`
□ 1. Claude Code 설치 + 로그인                          (5분)
□ 2. Obsidian 설치                                       (2분)
□ 3. Node.js 설치                                        (3분)
□ 4. Anaconda 설치 (또는 pip install pypdf 등)          (5~10분)
□ 5. 위키 폴더 받기 (git clone 또는 클라우드 동기화)    (2~10분)
□ 6. _workspace/.env 만들기                              (1분)
□ 7. node _workspace/openalex_helper.js diagnose 검증   (10초)
□ 8. Obsidian으로 폴더 열기 + Dataview 플러그인 설치    (3분)
□ 9. Claude Code에서 위 §4의 컨텍스트 복원 메시지 입력  (1분)
\`\`\`

---

## 한 장 요약

\`\`\`
이동:    git clone (또는 클라우드 동기화) — .env 제외
설치:    Claude Code · Obsidian · Node · Python(+pypdf)
재구성:  _workspace/.env 새로 작성 (OPENALEX_KEY)
복원:    Claude에게 "CLAUDE.md, MOC.md, overview 읽고 요약해줘"
주의:    PC별 대화 기록 자동 동기화 X — 중요 결정은 위키에 박을 것
\`\`\`
```
