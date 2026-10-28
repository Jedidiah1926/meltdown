# 픽셀아트 제작용 프롬프트 (GPT 이미지 생성)

프로토타입의 임시 그래픽을 교체할 에셋 목록과, 그대로 붙여 넣을 수 있는 프롬프트 모음.

## 0. 공통 규칙

### 해상도

- 게임 화면은 **1280×720**이고, 픽셀아트는 **2배 확대**해서 쓴다. 그래서 아트의 원본 해상도는 **640×360** 기준이다.
- 아래 "원본 크기"는 이 640×360 기준의 픽셀 크기다.
- GPT는 정확한 작은 크기로 그려 주지 못한다. **큰 이미지로 생성한 뒤 정수 배율로 축소**한다 (최근접 보간, 아래 명령 참고).

```sh
# ImageMagick: 최근접 보간으로 원본 크기에 맞춰 축소
magick input.png -filter point -resize 150x130! gauge_face.png
```

### 스타일 일관성

1. 매 요청마다 **레퍼런스 이미지**(Laborator "Meltdown" 썸네일)를 첨부하고 아래 **공통 스타일 블록**을 프롬프트 맨 앞에 붙인다.
2. 첫 에셋(벽면 배경)이 마음에 들면, 이후 요청에는 그 결과물도 함께 첨부하고 "match the style of the attached image"를 덧붙인다.
3. **글자는 넣지 않는다.** 계기 숫자·라벨은 게임에서 픽셀 폰트로 그린다.
4. 움직이는 부품(바늘, 손잡이, 다이얼, 휠, 덮개)은 **배경과 따로**, 투명 배경으로 만든다.

### 공통 스타일 블록 (모든 프롬프트 앞에 붙이기)

```
Retro industrial-horror pixel art for a nuclear reactor control room game, matching the attached reference image.
Strict front-facing orthographic view, no perspective, no camera angle.
Chunky visible pixels as if drawn on a 640x360 canvas and upscaled; no anti-aliasing, no smooth gradients (use dithering instead), no blur.
No text, no letters, no numbers, no logos.
Limited palette only: #0d0605, #1a0b08, #2a120d, #3a1c13, #55291b, #7a3420, #3b302b, #6b5a52, #e8b07a, #7a1410, #ff3b30, #ffb347, #f2c230, #5fd35f, #ff5a4e.
Dim red ambient light from above, faint red glow on metal edges, worn and scratched 1970s control room hardware.
```

### 폰트

글자는 GPT로 만들지 말고 **한글 픽셀 폰트**를 쓴다. 추천: Galmuri (오픈 폰트 라이선스, 한글 지원).

### 파일 위치

완성본은 `public/art/` 아래에 아래 표의 파일명으로 넣는다. 그러면 임시 그래픽을 교체하기 쉽다.

---

## 1. 벽면 콘솔 (위쪽 = 보는 것)

### 1-1. 벽면 배경 — `wall_bg.png`

- 원본 크기: **640×170**, 불투명
- 생성 크기: 1536×1024로 생성한 뒤 위아래를 잘라 비율을 맞춘다
- **오목한 자리 3곳의 위치가 게임 화면과 정확히 맞아야 한다.** 레이아웃 가이드 이미지 [`docs/art/wall_layout_guide.png`](art/wall_layout_guide.png)를 **레퍼런스 이미지와 함께 첨부**한다. 가이드의 검은 상자가 오목한 자리, 주황 선이 그 테두리다.

| 자리 | 용도 | 원본 좌표 (x, y, 너비×높이) | 가로 위치 (전체 폭 대비) | 세로 위치 (전체 높이 대비) |
|---|---|---|---|---|
| 왼쪽 | 위험도 게이지 | 10, 20, 150×130 | 1.6% ~ 25.0% | 11.8% ~ 88.2% |
| 가운데 | CRT 모니터 | 170, 10, 300×150 | 26.6% ~ 73.4% | 5.9% ~ 94.1% |
| 오른쪽 | 경고등 4개 + 계기 6줄 | 480, 10, 150×150 | 75.0% ~ 98.4% | 5.9% ~ 94.1% |

- 세 자리 사이 간격은 10픽셀로 아주 좁다. 자리 바깥 여백은 거의 없다.
- 생성 후 가이드 이미지와 겹쳐 보고 어긋나면, 같은 대화에서 "move the recesses to match the attached guide exactly"로 다시 요청한다.

```
[공통 스타일 블록]
A wide wall of a nuclear control room, dark rust-brown riveted steel panels with conduits and cable trays.
Use the attached layout guide image for composition: each black box in the guide is a recessed mounting area in the wall,
and the recesses must have exactly the same positions, sizes and proportions as the black boxes. Keep the same aspect ratio as the guide (640:170).
Left recess: a nearly square opening, from 1.6% to 25% of the width and from 12% to 88% of the height (for an analog gauge).
Center recess: a wide rounded rectangle, from 26.6% to 73.4% of the width and from 6% to 94% of the height (for a CRT monitor), with a small empty nameplate along its bottom edge.
Right recess: a square opening, from 75% to 98.4% of the width and from 6% to 94% of the height (for indicator lamps and readouts).
The gaps between recesses are very narrow, and there is almost no margin around them.
The recesses are empty dark holes framed by riveted steel; do not draw the gauge, monitor, lamps or any screens inside them.
Do not draw the orange guide lines.
```

### 1-2. 위험도 게이지 판 — `gauge_face.png`

- 원본 크기: **150×130**, 불투명
- 게이지는 반원이다. **왼쪽 수평 = 0%, 오른쪽 수평 = 100%(눈금 끝)**. 100% 너머에는 아무것도 그리지 않는다.
- 색 구간: 초록 0~40%, 노랑 40~75%, 빨강 75~100%

```
[공통 스타일 블록]
An analog radiation meter face inside a dark metal bezel, aged cream paper dial (#e8b07a).
A semicircular scale arc across the upper half: the arc starts exactly at the left horizontal (9 o'clock) and ends exactly at the right horizontal (3 o'clock).
The arc is colored in three bands: green for the first 40 percent of the arc from the left, yellow from 40 to 75 percent, red from 75 to 100 percent.
Small dark tick marks along the arc, a larger tick every quarter. Nothing beyond the right end of the arc.
A small black radiation trefoil symbol below the center. A round dark pivot hub at the center of the semicircle.
No needle. No numbers. No text.
```

### 1-3. 게이지 바늘 — `gauge_needle.png`

- 원본 크기: **6×62**, **투명 배경**
- 회전축은 **아래쪽 끝 가운데**. 게임에서 회전시킨다.

```
[공통 스타일 블록]
A single thin black meter needle pointing straight up, slightly tapered to a point at the top,
with a tiny round base at the bottom end. Isolated object, transparent background, nothing else.
```

### 1-4. CRT 모니터 테두리 — `crt_bezel.png`

- 원본 크기: **300×150**, 화면 부분은 **투명**
- 화면 영역: 테두리 안쪽 284×136 (가로 8, 세로 7 위치부터). 화면 내용(파형, 글자)은 게임에서 그린다.

```
[공통 스타일 블록]
A heavy industrial CRT monitor bezel seen straight from the front, dark gunmetal casing with screws in the corners,
thick rounded rectangular frame. The screen area inside the frame is completely empty and transparent (cut out).
A small empty dark nameplate under the screen. Isolated object, transparent background.
```

### 1-5. 경고등 — `lamp_off.png`, `lamp_amber.png`, `lamp_red.png`

- 원본 크기: 각 **16×16**, 투명 배경
- 세 장 모두 **같은 모양·같은 위치**여야 한다. 한 번에 세 개를 나란히 생성한 뒤 잘라 쓰는 것을 추천한다.

```
[공통 스타일 블록]
Three round indicator lamps side by side, identical shape and size, each in a small round metal bezel:
left lamp unlit (dark brownish glass), middle lamp lit amber (#ffb347) with a small glow,
right lamp lit alarm red (#ff3b30) with a small glow. Transparent background.
```

### 1-6. 계기 판넬 — `readout_panel.png`

- 원본 크기: **150×150**, 불투명
- 숫자는 게임에서 디지털 글꼴로 그린다. 판에는 **빈 표시창 6줄**만 있다.

```
[공통 스타일 블록]
A square instrument panel of dark steel with four empty round lamp sockets in a row at the top,
and below them six horizontal recessed black display windows stacked vertically, each window empty.
No numbers, no text.
```

---

## 2. 책상 (아래쪽 = 만지는 것)

### 2-1. 책상 상판 — `desk_bg.png`

- 원본 크기: **640×190**, 불투명
- 정면에서 본 책상 상판. 왼쪽과 오른쪽에 조작 장치가 놓일 자리, 가운데에 모듈 슬롯 베이가 있다.

```
[공통 스타일 블록]
The top surface of an operator's control desk seen straight from the front, worn dark brown metal with a lighter rust edge along the top.
In the center, a large dark recessed bay holding an empty grid of 2 rows by 4 columns of square sockets.
On the left and right sides, plain flat desk surface with a few scratches and bolts (controls will be placed there).
At the far left and far right edges, a narrow vertical slot in the desk surface for a lever.
Wide horizontal composition, aspect ratio 640:190.
```

### 2-2. 제어봉 레버 — `rod_track.png`, `rod_handle.png`

- 홈: **20×140**, 손잡이: **28×10**, 둘 다 투명 배경
- 홈에는 **21칸 눈금**(0~20)이 있고, 5칸마다 긴 눈금.

```
[공통 스타일 블록]
Two separate objects on a transparent background:
(1) a tall vertical black slotted rail mounted on a metal plate, with 21 evenly spaced short tick marks on its left side, every fifth tick longer;
(2) a separate horizontal metal lever grip/handle, worn grey steel with a dark outline, small enough to slide inside the rail.
```

### 2-3. SCRAM 버튼 — `scram_housing.png`, `scram_button.png`, `scram_button_pressed.png`, `scram_cover_closed.png`, `scram_cover_open.png`

- 하우징·버튼: **60×60**, 덮개(닫힘): **60×60**, 덮개(열림, 위로 젖혀진 모습): **60×16**, 전부 투명 배경
- 버튼은 레퍼런스 이미지 오른쪽 위의 빨간 버튼 느낌.

```
[공통 스타일 블록]
An emergency shutdown push button assembly, seen from the front, as separate parts on a transparent background:
(1) a square housing with a yellow-and-black diagonal hazard stripe border and a dark inner recess;
(2) a big round glossy red mushroom button (#ff3b30) that fits the recess;
(3) the same red button pressed in, darker (#7a1410);
(4) a transparent light-blue plastic safety flip cover, closed, fitting over the housing;
(5) the same safety cover flipped open upward, seen edge-on as a thin bar.
```

### 2-4. 냉각 펌프 다이얼 — `pump_dial_face.png`, `pump_knob.png`

- 판: **70×70**, 손잡이: **52×52**, 투명 배경
- 손잡이는 **위쪽을 가리키는 표시선**이 하나 있다 (게임에서 회전).
- 판의 눈금은 7시 반 방향에서 시작해 4시 반 방향에서 끝난다. 마지막 두 칸은 빨간 눈금 (85% 이상 = 펌프 마모 구간).

```
[공통 스타일 블록]
Two separate objects on a transparent background:
(1) a round dark dial plate with 11 tick marks arranged on a 270-degree arc from the 7:30 position clockwise to the 4:30 position, the last two ticks red, others pale;
(2) a separate round knurled grey metal control knob seen from the front, with a single bright amber pointer line pointing straight up.
```

### 2-5. 터빈 밸브 휠 — `valve_wheel.png`

- 원본 크기: **64×64**, 투명 배경
- 회전 대칭이어야 한다 (게임에서 돌린다).

```
[공통 스타일 블록]
A rusty red industrial valve handwheel seen straight from the front: an outer ring, four straight spokes in a plus shape,
and a round metal hub in the center. Perfectly rotationally symmetric. Transparent background.
```

### 2-6. 포기 장치 — `abandon_lever_up.png`, `abandon_lever_down.png`, `abandon_box.png`, `abandon_cover.png`

- 레버: 각 **20×76**, 상자: **70×22**, 덮개: **70×22**, 투명 배경
- 레버 두 개(좌우)는 같은 이미지를 쓴다. 당기면 손잡이가 아래로 내려가고 빨갛게 된다.

```
[공통 스타일 블록]
Separate objects on a transparent background:
(1) a tall vertical pull lever in a narrow black slot, grey metal handle at the top position;
(2) the same lever pulled down, handle at the bottom position, handle painted alarm red;
(3) a small wide black box with a yellow hazard border containing one small round red button;
(4) a transparent light-blue safety cover that fits exactly over that small box.
```

### 2-7. 모듈 슬롯 — `slot_empty.png`, `slot_blocked.png`

- 원본 크기: 각 **55×54**, 불투명
- 막힌 슬롯은 어려운 연도에서 쓰인다 (철판으로 덮이고 볼트로 고정됨).

```
[공통 스타일 블록]
Two square desk sockets side by side, same size:
(1) an empty recessed square socket with connector pins at the bottom, dark interior;
(2) the same socket covered by a bolted steel plate with a diagonal hazard stripe, indicating it is blocked.
```

### 2-8. 모듈 카트리지 — `module_<분류>.png`

- 원본 크기: 각 **50×49**, 투명 배경
- 분류 6종, **모양은 같고 위쪽 띠 색만** 다르다. 한 번에 6개를 생성한 뒤 잘라 쓴다.

| 파일 | 분류 | 띠 색 |
|---|---|---|
| `module_stopgap.png` | 임시방편 | 주황 #d98a2b |
| `module_fix.png` | 해결 | 초록 #3fa34d |
| `module_info.png` | 정보 | 파랑 #3f7fc0 |
| `module_support.png` | 운전 보조 | 회색 #7d7d7d |
| `module_risky.png` | 하이 리스크 | 빨강 #c0392b + 검은 사선 |
| `module_special.png` | 원자로 전용 특수 | 보라 #8e5cc4 |

```
[공통 스타일 블록]
Six identical plug-in hardware cartridges in a 3x2 grid, each a chunky rectangular metal module with a thick colored band across the top
and an empty dark square window in the middle (for an icon). The only difference between them is the band color:
orange #d98a2b, green #3fa34d, blue #3f7fc0, grey #7d7d7d, red #c0392b with black diagonal hazard stripes, purple #8e5cc4.
Transparent background, even spacing between them.
```

### 2-9. 모듈 아이콘 — `icon_<모듈 id>.png`

- 원본 크기: 각 **16×16**, 투명 배경. 카트리지 가운데 창에 들어간다.
- 4개씩 묶어서 생성하는 것을 추천한다 (2×2 배치로 요청한 뒤 잘라 쓰기).

| 파일 | 모듈 | 그림 설명 (프롬프트에 그대로 사용) |
|---|---|---|
| `icon_makeup.png` | 보충수 주입 펌프 | a water drop with a plus sign |
| `icon_limiter.png` | 출력 제한기 | a horizontal ceiling line with an arrow pushing down |
| `icon_lubricator.png` | 펌프 베어링 윤활기 | an oil can with a drop |
| `icon_isolation.png` | 누설 구간 격리 밸브 | a pipe with a closed gate valve |
| `icon_sparePump.png` | 예비 펌프 전환반 | two pumps with a switch arrow between them |
| `icon_boric.png` | 붕산 주입 장치 | a syringe |
| `icon_diagnostics.png` | 설비 진단기 | a magnifying glass over a gear |
| `icon_coreLimit.png` | 노심 한계 측정기 | a gauge needle hitting a stop pin |
| `icon_fastRods.png` | 고속 제어봉 구동장치 | a vertical rod with speed lines |
| `icon_relief.png` | 자동 압력 방출 밸브 | a valve releasing a puff of steam |
| `icon_extraPump.png` | 증설 냉각 펌프 | a pump with a plus sign |
| `icon_turbineHE.png` | 고효율 터빈 | a turbine fan with a lightning bolt |
| `icon_overPump.png` | 과부하 냉각 펌프 | a pump with flames / overheating marks |

```
[공통 스타일 블록]
Four tiny 16x16 pixel icons in a 2x2 grid with even spacing, simple bold silhouettes with 1-pixel dark outlines, amber and pale tones:
(top-left) <그림 설명 1>, (top-right) <그림 설명 2>, (bottom-left) <그림 설명 3>, (bottom-right) <그림 설명 4>.
Transparent background.
```

---

## 3. 연출

### 3-1. 대피하는 운전원의 상반신 그림자 — `evac_shadow.png`

- 포기 결말에서, 책상 앞에 있던 운전원의 **상반신 그림자**가 옅게 오른쪽으로 빠져나가는 장면에 쓴다.
- 원본 크기: **160×150**, 투명 배경. **뒤에서 본** 머리·어깨·몸통 윗부분만 (아래쪽은 화면 밖으로 잘린다)
- 게임에서 반투명하게 깔고 흐리게 번지게 처리하므로, 그림은 **진한 단색 실루엣**이면 된다.
- 지금은 같은 모양의 임시 그래픽이 대신 나온다.

```
[공통 스타일 블록]
The silhouette of a person's head, shoulders and upper torso seen from directly behind, as if sitting at a desk in front of the viewer.
Solid near-black shape (#0d0605) with no details, no rim light. The bottom of the torso is cut off flat at the bottom edge of the image.
Centered, transparent background.
```

## 4. 결말 일러스트 (선택)

- 원본 크기: 각 **640×360**, 불투명
- 결말 연출에서 화면이 어두워진 뒤 떠오르는 그림. 프로스트펑크식 페이드 아웃.

| 파일 | 결말 | 그림 설명 |
|---|---|---|
| `ending_stable.png` | 운전 중 안정화 | the control room at dawn, all lamps green, the operator leaning back in the chair, calm |
| `ending_cold.png` | 냉온 정지 | the control room dark and silent, only a few amber standby lights, steam fading outside the window |
| `ending_meltdown.png` | 멜트다운 | the control room flooded with blinding red light, alarms, the operator's silhouette still at the desk |
| `ending_abandon.png` | 포기 (체포) | night outside the plant gate, the operator in handcuffs between police flashlights, a red glow and smoke rising behind |

```
[공통 스타일 블록]
A wide cinematic pixel art scene, aspect ratio 16:9: <그림 설명>.
```

---

## 5. 체크리스트

- [x] 벽면 배경으로 스타일 확정 (`public/art/wall_bg.png`, 게임에 적용됨)
- [x] 위험도 게이지 판·바늘 (게임에 적용됨. 그림의 색 경계는 실제로 약 50%·81% 위치라서, 바늘 각도를 구간별로 맞춰 규칙의 40%·75%가 경계를 가리키게 함)
- [x] CRT 테두리 (게임에 적용됨)
- [x] 경고등 (꺼짐·주황·빨강 + 추가로 만든 초록까지 4종, 게임에 적용됨: 정상 초록 / 고장 징후 주황 깜빡임 / 고장 빨강)
- [ ] 계기 판넬
- [x] 책상 상판 (게임에 적용됨, 슬롯·포기 레버 위치를 그림에 맞춤)
- [ ] 제어봉 레버, SCRAM, 펌프 다이얼, 터빈 휠, 포기 장치
- [ ] 슬롯 2종, 모듈 카트리지 6종, 아이콘 13종
- [ ] 대피 상반신 그림자 (지금은 임시 그래픽)
- [ ] (선택) 결말 일러스트 4종
