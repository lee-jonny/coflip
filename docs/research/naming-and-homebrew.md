# 앱 이름 후보와 Homebrew 저장소 조사

이 문서는 이름 변경 전의 조사 기록이다. 최종 앱 이름은 CoFlip이며 현재 설치 방법은 [README](../../README.md)를 참고한다.

2026-11-19 기준. 개인 Mac에서 부르기 편한 이름으로는 **코시프**, 기존 사용자가 검색하고 설치할 때는 **Codex Shift**를 추천한다. 공개 소개에는 “코시프(Codex Shift) — Codex 계정 전환 도구”처럼 둘을 함께 쓸 수 있다.

## 이름 후보

| 후보 | 선택할 이유 | 아쉬운 점 |
| --- | --- | --- |
| 코시프 · Coshif | 세 음절이고 기존 이름의 ‘코’와 ‘시프’가 모두 들린다. 바리스타와 함께 부르기 쉽다. | 듣고 영문 철자를 맞히기 어렵고, 한국사회책임투자포럼(KoSIF)도 ‘코시프 뉴스픽’이라는 코너를 운영한다. [발행처 뉴스레터](https://kosif.stibee.com/p/62) |
| 코플립 · CoFlip | ‘플립’에서 두 프로필을 전환하는 행동이 연상되고 영문을 끊어 읽기 쉽다. | Codex Shift와의 연결이 약해지고, 계정이 둘뿐이라는 인상을 줄 수 있다. |
| 교대 | 개인 계정에서 업무 계정으로 바꾸는 상황을 두 음절로 표현한다. 바리스타가 교대한다는 연상도 가능하다. | 일반명사여서 단독 검색어로는 약하다. |
| 코덱시프 | 기존 이름과 연결되는 발음이 가장 많이 남는다. | 네 음절이어서 일상적으로 부를 때 얻는 이점이 작다. |

공식 Homebrew cask 목록의 정확한 토큰을 대조했을 때 `coshif`, `coflip`은 없었고 `shift`는 계정과 앱을 한곳에서 관리하는 다른 제품에 쓰인다. GitHub 공개 저장소 이름에서 `coshif`를 검색한 결과 17개 중 이름 전체가 `coshif`인 항목은 0개였다. 이 확인 범위는 공식 cask와 GitHub의 공개 저장소명까지다. [Homebrew cask 목록](https://formulae.brew.sh/api/cask.json) · [Shift 패키지](https://formulae.brew.sh/cask/shift) · [GitHub 검색 API](https://api.github.com/search/repositories?q=coshif+in%3Aname&per_page=100)

## 공용 tap의 운영 비용

현재 `willofi/codex-shift`는 앱 소스, GitHub Releases의 배포 파일, Homebrew 설치 명세를 함께 관리한다. `cxs update`는 `willofi/codex-shift/codex-shift`를 직접 지정한다. 자주 쓰는 동작은 이미 한 줄이므로 몇 대의 개인 Mac에서 쓴다면 지금 구조가 간편하다. [배포 명세](../../Casks/codex-shift.rb) · [업데이트 구현](../../src/cli.js)

공용 tap은 GitHub 리포지토리 하나를 **추가**하는 설계다. 각 앱의 코드와 릴리스는 원래 프로젝트에 두고, 세 번째 리포지토리 `willofi/homebrew-apps`에 앱마다 설치 명세 한 파일을 둔다. 두 앱은 모두 cask를 제공하므로 `Casks/codex-shift.rb`와 `Casks/barista.rb`를 나란히 두면 된다. 코시프의 경우 명세가 가리키는 DMG URL은 기존 프로젝트의 것이다. [Homebrew tap 구성](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) · [현재 DMG URL과 체크섬](../../Casks/codex-shift.rb) · [바리스타 cask](https://github.com/willofi/Barista/blob/main/Casks/barista.rb)

이 구조를 도입하면 처음 쓰는 사람도 `brew install --cask willofi/apps/codex-shift` 한 줄로 설치할 수 있다. 지금은 프로젝트 저장소에 `homebrew-` 접두어가 없어서 최초 등록 시 URL을 별도로 적는다. 공용 tap으로 옮기면 향후 릴리스마다 별도 저장소의 버전과 체크섬도 맞춰야 하고, 설치된 v0.2.3의 업데이트 명령이 옛 tap을 찾는 문제도 처리해야 한다. 외부 사용자에게 두 앱을 함께 소개할 시점에 공용 tap과 기존 설치 이전을 함께 준비하는 편을 추천한다. [Homebrew 저장소 명명 규칙](https://docs.brew.sh/Taps) · [Homebrew 직접 설치](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) · [현재 CLI](../../src/cli.js)
