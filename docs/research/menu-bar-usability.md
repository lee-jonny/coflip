# CoFlip 메뉴 막대 사용성 조사

2026-11-19 기준. 메뉴 막대의 상시 표시와 아이콘을 눌렀을 때의 메뉴를 각각 개선 대상으로 본다.

## 지금 메뉴에서 선택하기 어려운 이유

- 첫 화면에 호스트 이름과 프로필 목록, 관리 명령 7개가 함께 나온다. 프로필마다 경로와 사용량 상세 위에 작업 8개가 반복되고, 삭제할 수 있는 프로필에는 삭제 항목이 하나 더 붙는다. 업무 프로필에서 대화를 이어가려면 `Resume in folder…`와 `Resume across folders`, `Continue on another Mac…`의 차이를 먼저 알아야 한다. [현재 메뉴 구성](../../app/main.cjs#L56)
- 아이콘 옆 제목은 최근에 사용한 프로필의 사용량을 기준으로 한다. 어느 프로필의 수치인지 툴팁에서만 확인할 수 있다. 사용량 조회가 실패하면 직전 수치가 남을 수 있으므로 짧게 표시하더라도 현재 값과 마지막으로 확인한 값은 구분해야 한다. [아이콘 제목과 툴팁](../../app/main.cjs#L665) · [사용량 상태](../../src/codex-usage.js#L58)
- 기존 Codex에 연결하는 프로필이 항상 목록에 포함된다. 만들 수 있는 프로필이 아직 없어도 `기존 Codex`에서 시작할 수 있다. 기존 Codex 홈과 보호 대상은 삭제 메뉴의 대상에서 제외된다. [프로필 목록과 기존 Codex](../../src/core.js#L23) · [삭제 가능 조건](../../src/core.js#L101)

## macOS 가이드에서 적용할 점

- Apple은 하위 메뉴가 명령을 가리기 때문에 깊이와 길이를 제한하고 일반적으로 한 단계만 쓰라고 권한다. 첫 화면에서 사용자 목적과 관계가 뚜렷한 동사를 쓰고, 드물게 필요한 항목은 설정 화면에서 찾도록 하는 편이 CoFlip에 맞는다. [Apple 메뉴 가이드](https://developer.apple.com/design/human-interface-guidelines/menus)
- 메뉴 막대 공간은 제한되어 상태 아이콘 자체가 일시적으로 숨겨질 수 있다. CoFlip에는 아이콘만 기본으로 두고, 기존의 최근 프로필 잔여율은 사용자가 켜는 옵션으로 제공하는 방향을 제안한다. [Apple NSStatusBar](https://developer.apple.com/documentation/appkit/nsstatusbar)
- Electron의 `Tray.setContextMenu`와 `Menu.buildFromTemplate`으로 현재 네이티브 메뉴 방식을 유지할 수 있다. Electron은 macOS 트레이의 최상위 항목에서 `enabled`와 `visibility` 속성에 제약이 있다고 안내한다. 그래서 조건에 맞지 않는 항목은 템플릿을 만들 때 제외하고, 상태만 보여 주는 비활성 헤더에 의존하지 않는 편이 좋다. [Electron Tray Menu](https://www.electronjs.org/docs/latest/tutorial/tray) · [Electron Menu](https://www.electronjs.org/docs/latest/api/menu)

## 프로필부터 고르는 네이티브 메뉴

최상위에 `기존 Codex ▸`, `업무 · 38% ▸`, `개인 ▸`를 두고 아래에 `설정…`, `종료`를 둔다. 각 프로필을 열면 `대화 이어서`, `Codex 열기`, `새 터미널 작업…`으로 시작한다. 로그인이 필요한 프로필에는 `로그인…`을 보여 준다. `대화 이어서`는 현재 Mac에서 선택한 프로필의 대화 선택기를 연다. 폴더로 좁힌 재개, 다른 Mac, 도구 설정, 프로필 관리와 상태 상세는 설정 또는 프로필 도구 화면에서 접근한다. 사용량 뒤에 기간을 명시하거나 상세에서 확인할 수 있게 하고, 지난 값은 예를 들어 `38% · 이전`으로 표시한다.

```ts
buildMenu(
  snapshot: { profiles: ProfileSummary[]; recentProfileId?: string },
  dispatch: (action: MenuAction) => void
): MenuItemConstructorOptions[]
```

업무 프로필의 이어서 명령은 `dispatch({ type: "resume", profileId: "work" })`를 보낸다. 명령 처리부가 ID로 실행 시점의 실제 프로필을 확인하고, 세션 목록을 띄우는 기존 동작에 연결한다. 메뉴는 홈 경로, 저장 형식, 실행 인자, 사용량 조회에 의존할 필요가 없다. 선택한 프로필과 실행할 명령이 같이 보여 실수 가능성이 낮고, 자주 쓰는 프로필에서도 하위 메뉴를 한 번 열어야 한다.

## 사용성 확인 시나리오

- 첫 설치 사용자가 `기존 Codex`에서 이름과 경로를 따로 설정하지 않고 Codex를 열 수 있다.
- 업무·개인 프로필을 가진 사용자가 이어갈 프로필을 명확히 고를 수 있다. 첫 실행이나 최근 프로필 삭제 뒤에는 묵시적으로 다른 프로필에서 대화를 열지 않는다.
- 로그인 필요·조회 불가·이전 수치를 구분할 수 있다. 툴팁이나 색상만으로 중요한 상태를 전달하지 않는다.
- 폴더를 지정한 재개, 다른 Mac, `cxs` 관리, 자동 시작은 짧아진 메뉴에서도 발견 가능하다. 키보드와 VoiceOver로 프로필과 명령을 찾고 실행할 수 있는지 실제 macOS에서 확인한다.

위 구조와 확인 기준은 제품 제안이며, 사용자 실험 결과는 아직 없다.

## 작업부터 고르는 네이티브 메뉴

첫 화면에 `대화 이어서 ▸`, `Codex 앱 열기 ▸`, `새 대화 ▸`, `사용량 ▸`, `설정…`, `종료`를 둔다. `대화 이어서 → 업무`는 해당 프로필에서 Mac 전체 기존 대화 선택기를 연다. `새 대화 → 업무`는 기존 폴더 선택으로 연결된다. 최근 사용한 프로필은 각 목록의 위에 놓고, 계정 전환이 실행된 것처럼 표시하지 않는다. `폴더에서 이어서…`와 `다른 Mac에서 이어서…`는 관련 대화 작업에서 찾을 수 있게 한다.

구성 함수는 `buildTrayMenu(snapshot, dispatch)`이며 메뉴가 `{ kind: "resume", profileId: "work", scope: "all" }`과 같은 작업을 보낸다. 실행부가 기존 프로필 조회, 경로 선택, 로그인 및 필요시 Codex 재실행 확인을 맡는다. 같은 프로필에서 작업을 여럿 할 때 프로필을 다시 선택하게 되지만, 처음 메뉴를 열었을 때 할 수 있는 일이 바로 보인다. [기존 실행 흐름](../../app/main.cjs#L404) · [Apple 메뉴 가이드](https://developer.apple.com/design/human-interface-guidelines/menus)

## 프로필과 작업을 한 화면에 두는 팝오버

메뉴 막대 아이콘 아래 작은 패널에서 `사용할 프로필 [기존 Codex ▾]`, 해당 프로필의 사용량, `Codex 열기`, `대화 이어서`, `설정…`을 표시한다. 로그인이 필요하면 해당 프로필에 맞는 로그인 버튼을 표시한다. `show(anchor, view)`, `update(view)`, `onIntent(handler)`가 표시 위치, 갱신과 입력의 경계를 이룬다. 실행 요청에는 대상 프로필을 명시한다. 계정을 고른 뒤 여러 동작을 할 때 알기 쉽고, 키보드 탐색·VoiceOver·바깥 클릭·다중 화면 위치를 직접 검증해야 한다. [Apple 팝오버 가이드](https://developer.apple.com/design/human-interface-guidelines/popovers) · [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)

## 제안

기본은 아이콘만 표시하고 작업 우선 메뉴를 연다. 중요한 항목은 `대화 이어서`, `Codex 앱 열기`, `새 대화` 순서로 둔다. 사용량 기간과 측정 시각, 홈 경로는 각각 사용량 상세와 프로필 관리에서 표시한다. 최근 프로필 정렬을 편의로 쓰고 두 번째 선택에서 대상이 드러나게 한다. 사용자가 첫 실행과 평소의 재개 흐름에서 어디를 눌러야 할지 설명 없이 찾을 수 있는지 검증한다.
