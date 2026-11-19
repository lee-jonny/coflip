# 세 대의 Mac에서 Codex 대화를 이어 쓰기

2026년 11월 19일 기준. Codex Shift 커밋 `615c217`, 이 Mac의 `codex-cli 0.169.0-alpha.11.1`, OpenAI 공식 문서를 대조했다.

**세 Mac에 같은 이름의 프로필을 만들고 같은 ChatGPT 계정으로 로그인해도 일반적인 로컬 CLI 세션은 자동으로 동기화되지 않는다.** Shift에서 이름은 이 Mac의 디렉터리를 고른다. 기본값으로 A의 `personal`과 B의 `personal`은 각자 디스크의 `~/.codex-profiles/personal`이다. Codex의 `resume`은 해당 호스트의 저장된 대화를 찾는다. 이름을 통일하면 어느 계정을 고를지 기억하기 편해진다. [Shift의 경로 결정과 실행](../../src/core.js) · [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) · [로컬 세션 저장 위치](https://learn.chatgpt.com/docs/reference/troubleshooting)

## 지금 가능한 세 가지 방법

| 하고 싶은 일 | 방법 |
| --- | --- |
| 원래 Mac에서 잃어버린 대화 찾기 | 원래 프로필에서 `cxs path personal`로 홈을 확인하고 `cxs run personal -- resume --all`을 실행한다. 기본 목록은 작업 디렉터리로 좁혀진다. `--all`은 그 필터를 풀며, 다른 Mac이나 홈까지 검색하지 않는다. 대화 ID를 알면 같은 홈에서 `cxs run personal -- resume <ID>`로 직접 열 수 있다. `exec`로 만든 대화는 지원 버전에서 `--include-non-interactive`도 필요할 수 있다. [Shift 명령 전달](../../src/cli.js) · [resume 옵션](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-resume) |
| 다른 Mac에서 원래 Mac의 작업 계속하기 | 터미널에서는 SSH로 원래 Mac에 접속해 그곳의 프로젝트 폴더에서 같은 Shift 프로필로 재개한다. 데스크톱에서는 지원 버전의 **Settings → Connections → Control other devices**로 원래 Mac을 연결해 기존 대화를 연다. 호스트가 깨어 있고 온라인이어야 하며, 데스크톱 연결에는 같은 계정·워크스페이스와 조직의 허용 여부가 중요하다. 파일 변경과 도구 실행은 원래 Mac에서 일어난다. [원격 연결 요건과 실행 위치](https://learn.chatgpt.com/docs/remote-connections) |
| 두 번째 Mac에서 실제로 실행하기 | 지원되는 CLI에서는 현재 대화에 `/app`을 입력해 데스크톱에서 연다. 목적지를 연결하고 양쪽에 같은 Git 저장소를 프로젝트로 저장한다. 하위 폴더를 프로젝트로 쓰면 양쪽에서 그 폴더도 일치시킨다. 대화 하단의 실행 위치에서 목적지를 고르고 **Hand off**를 누르면 대화와 Git 상태가 목적지 worktree로 이동한다. 진행 중인 응답은 중단된다. [CLI의 /app](https://learn.chatgpt.com/docs/developer-commands?surface=cli) · [호스트 간 Handoff](https://learn.chatgpt.com/docs/remote-connections#hand-off-a-chat-between-hosts) |

Shift의 프로필과 Codex 자체의 `--profile`도 구별해야 한다. 이 Mac에서 `codex --help`가 설명하는 `--profile`은 같은 홈에 있는 설정 파일을 겹쳐 적용한다. Shift는 실행 환경의 `CODEX_HOME` 자체를 교체한다. 대화 목록에는 SQLite 인덱스도 쓰이므로 `history.jsonl` 하나를 옮기거나 사용 중인 프로필 폴더를 iCloud로 합치는 방식을 세 Mac의 기본 설계로 삼기 어렵다. OpenAI가 별도로 문서화한 공유 홈은 파일 잠금과 DB 설정을 검증한 Linux NFS 배포다. [Shift 환경 설정](../../src/core.js) · [설정 및 상태 경로](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations) · [공유 홈과 SQLite](https://learn.chatgpt.com/docs/environments/network-file-systems)

## 프로필을 만들지 않고 CLI와 Computer Use 쓰기

- **기존 로그인 재사용.** 이미 설정한 CLI와 같은 셸 환경에서 `codex login status`로 확인하고 `codex`를 실행하면 된다. `CODEX_HOME`이 지정되어 있으면 그 홈을, 미지정이면 기본 `~/.codex`를 쓴다. Shift는 현재 `cxs run`에서 등록된 프로필을 선택하도록 한다. OpenAI 모델을 로컬에서 쓰는 공식 개인 인증 방식은 ChatGPT 로그인과 사용량 기반 API 키다. [인증](https://learn.chatgpt.com/docs/auth) · [Shift 프로필 선택](../../src/cli.js)
- **일반 플러그인.** CLI에서 `codex plugin list --available --json`으로 이 환경에 보이는 항목을 찾고 `codex plugin add <플러그인>@<마켓플레이스>`로 선택해 설치한다. Shift 프로필을 대상으로 하려면 두 명령의 `codex`를 `cxs run personal --`로 바꾼다. API 키로도 지원되는 OpenAI 큐레이션 플러그인을 설치할 수 있다. 일부 OAuth 연결에는 제한이 있고, 번들 스킬은 설치 후 새 대화에서 사용할 수 있다. [CLI 명령](https://learn.chatgpt.com/docs/developer-commands?surface=cli) · [플러그인과 API 키](https://learn.chatgpt.com/docs/plugins#api-key-availability)
- **Mac 화면 조작.** 공식 Computer Use 설정 경로는 ChatGPT 데스크톱의 Work 또는 Codex에서 **Settings → Computer use → Any App**을 설치하거나 켜는 것이다. 이전 UI라면 Computer Use 플러그인 설정을 따른다. 처음 사용할 Mac에서 화면 기록과 손쉬운 사용 권한, 대상 앱 접근 승인을 확인한다. CLI의 일반 플러그인 설치 명령만으로 독립 터미널에서 이 기능까지 활성화된다는 공식 절차는 확인하지 못했다. 지원 지역, 워크스페이스 설정, 앱 승인에 따라 가용성이 다르다. [Computer Use 설정과 권한](https://learn.chatgpt.com/docs/computer-use)

## 계정과 정책

본인이 만든 계정을 본인 기기 여러 대에서 사용하는 것은 OpenAI가 명시적으로 허용한다. 개인·업무 계정 전환은 웹·모바일에서도 공식적으로 지원한다. 이 설명의 대상은 해당 제품의 계정 전환이며, 제3자 CLI에 대한 별도 승인을 뜻하지 않는다. 조직 계정에는 사업자 약관과 조직의 원격 연결·도구·데이터 반출 정책을 함께 적용해야 한다. [계정 공유 정책](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy) · [공식 계정 전환 범위](https://help.openai.com/en/articles/20001068-using-multiple-chatgpt-accounts-on-web-and-mobile) · [적용 약관](https://openai.com/ko-KR/policies/row-terms-of-use/)

제품의 기준은 사용자가 권한을 가진 계정·워크스페이스를 직접 선택하는 것이다. 타인과 자격 증명을 공유하거나 사용량 제한을 회피하는 행위는 개인 약관에서 금지한다. 잔량이 다하면 다른 유료 계정으로 자동 전환하는 기능은 제외하고 기존 계정에서 제공하는 크레딧·재설정 옵션을 안내하는 편이 맞다. 일부 개인 유료 플랜은 한 장치에서 사용할 수 있는 유료 계정 수에도 제한이 있다. 이는 본인 계정 하나를 세 기기에서 사용하는 경우와 구분된다. [개인 이용약관](https://openai.com/ko-KR/policies/row-terms-of-use/) · [장치 제한과 지원 옵션](https://help.openai.com/en/articles/20001559-understanding-card-and-device-limits-in-chatgpt)

## Codex Shift에 먼저 반영할 개선

1. **첫 실행에서 ‘기존 Codex 사용’ 제공.** 현재 환경이 가리키는 홈과 Mac 이름을 표시하고, 등록이나 재로그인 없이 실행할 수 있게 한다. 외부 홈에는 Shift 소유권을 부여하지 않는다. 현행 삭제 함수는 홈을 재귀 삭제하므로 기본 홈·외부 홈은 삭제 대상에서 제외해야 한다. [프로필 생성과 삭제](../../src/core.js) · [CLI 선택기](../../src/cli.js)
2. **메뉴에서 ‘이 Mac에서 대화 재개’와 ‘다른 Mac에서 이어가기’ 제공.** 첫 동작은 선택한 홈에 `resume`을 전달하고 ‘모든 폴더 보기’를 노출한다. 두 번째는 원래 호스트에서 계속할지, 목적지로 Handoff할지 고르게 한다. 현재 실행 중인 앱을 그대로 활성화하면 다른 프로필이 표시될 수 있으므로 활성 호스트·홈을 확인할 수 있게 한다. [기존 앱 실행 동작](../../README.md) · [원격 연결](https://learn.chatgpt.com/docs/remote-connections)
3. **‘도구 설정’에서 설치·인증·Mac 권한 구분.** 선택 홈에서 CLI 버전과 플러그인 목록을 조회해 그 CLI가 지원하는 명령만 제시한다. 일반 플러그인은 선택 설치로, Computer Use는 데스크톱 설정으로 연결한다. 여러 Mac에 같은 도구를 맞추고 싶을 때 공유할 후보는 플러그인 식별자 목록이다. 각 Mac과 워크스페이스에서 가용성·승인을 다시 확인한다. [플러그인](https://learn.chatgpt.com/docs/plugins) · [Computer Use](https://learn.chatgpt.com/docs/computer-use)
4. **사용량 조회를 공식 인터페이스로 교체.** 현재 트레이는 프로필의 `auth.json`을 열고 ChatGPT 토큰으로 관찰된 HTTP 경로를 순서대로 호출한다. 키체인에 인증 상태가 저장되면 파일 유무만으로 로그인 여부를 판별하기 어렵다. 선택한 홈의 Codex App Server가 제공하는 `account/read`와 `account/rateLimits/read`를 사용하고, 지원되지 않는 인증 방식이나 버전은 ‘조회 불가’로 표시하는 방안을 권한다. [현재 구현](../../src/codex-usage.js) · [자격 증명 저장 방식](https://learn.chatgpt.com/docs/auth) · [App Server](https://learn.chatgpt.com/docs/app-server)

**검증 범위.** 이 Mac에서 CLI 버전, resume·plugin 명령 도움말, 임시 Shift 프로필에서 하위 명령 전달을 확인했다. 나머지 두 Mac의 실제 저장 데이터, 원격 페어링, Handoff, Computer Use 설치 및 조직별 권한은 실기 검증하지 않았다.
