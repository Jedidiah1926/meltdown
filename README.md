# MELTDOWN

원자력 발전소 제어실 운전원이 되어 위기 하나를 수습하는 실시간 + 일시정지 로그라이크.

- 기획서: [`docs/GDD.md`](docs/GDD.md)
- 픽셀아트 프롬프트: [`docs/art-prompts.md`](docs/art-prompts.md)

## 프로토타입 실행

현재는 **프로토타입**이다. 가압경수로 1종, 2000 단계, 임시 그래픽.

```sh
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm test         # 시뮬레이션 테스트
npm run build    # 타입 검사 + 배포용 빌드 (dist/)
```

## 배포 (GitHub Pages)

`index.html`은 TypeScript 원본을 불러오므로 그대로는 브라우저에서 실행되지 않는다. `main`에 푸시하면 `.github/workflows/deploy.yml`이 Vite로 빌드한 `dist/`를 Pages에 배포한다.

- 최초 1회: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정
- 주소: `https://<사용자>.github.io/meltdown/`

## Windows 앱 (exe) 과 자동 업데이트

- `v`로 시작하는 태그를 푸시하면 `.github/workflows/release.yml`이 Windows 설치 파일(`MELTDOWN Setup x.y.z.exe`)을 만들어 GitHub Release에 올린다.
- 설치된 게임은 실행할 때마다 Release에서 새 버전을 확인한다. 새 버전이 있으면 백그라운드로 받은 뒤 "지금 재시작 / 나중에"를 묻는다. "나중에"를 고르면 게임을 끌 때 설치된다.
- 서명하지 않은 설치 파일이라 처음 실행할 때 Windows 보안 경고가 뜬다 ("추가 정보 → 실행").

새 버전 내기 (둘 중 하나):

```sh
npm version patch        # 0.1.0 → 0.1.1, 커밋과 태그를 함께 만든다 (minor / major 도 가능)
git push --follow-tags   # 태그가 올라가면 Release가 자동으로 만들어진다
```

또는 `package.json`의 버전을 올려 `main`에 머지한 뒤, GitHub의 **Actions → Release (Windows) → Run workflow**를 누른다. Release를 만들면서 `v<버전>` 태그가 자동으로 생긴다.

로컬에서 데스크톱 앱으로 실행: `npm run app`

## 조작

| 입력 | 동작 |
|---|---|
| Q / A 또는 레버 드래그 | 제어봉 빼기(출력↑) / 넣기(출력↓) |
| W / S 또는 다이얼 드래그·휠 | 냉각 펌프 |
| E / D 또는 휠 돌리기 | 터빈 밸브 (실제 밸브는 천천히 따라온다) |
| X 두 번 또는 클릭 두 번 | SCRAM (덮개 → 버튼) |
| 해결 모듈 클릭 | 모듈 사용 (일회용) |
| Space | 일시정지 (일시정지 중 모듈 드래그로 재배치) |
| 책상 양 끝 레버 2개 내리기 → SCRAM 아래에서 솟은 Π자 손잡이 끌어내리기 | 포기 |

## 사용한 글꼴

- [마루미냐 한글 (x12y12pxMaruMinyaHangul)](https://github.com/quiple/x12y12pxMaruMinyaHangul) — SIL Open Font License 1.1 (`public/fonts/x12y12pxMaruMinyaHangul-OFL.txt`)

## 구조

- `src/sim/` — 원자로 시뮬레이션과 한 판의 규칙 (화면과 분리된 순수 TypeScript)
- `src/ui/` — PixiJS 화면 (벽면 콘솔, 책상, 오버레이)
- `tests/` — Vitest 테스트와 밸런스 확인용 봇
- `electron/` — 데스크톱 앱 진입점과 자동 업데이트
