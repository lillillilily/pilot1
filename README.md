# Motion Perception Pilot Survey

## 폴더 구조
```
pilot_survey/
├── index.html          # 설문 HTML 구조(마크업) 파일
├── css/
│   └── survey.css      # 설문 포맷/스타일 파일
├── js/
│   ├── survey-texts.js # 문항/안내/버튼 텍스트 파일
│   ├── survey-config.js# 실험 설정 파일
│   └── survey-app.js   # 실험 진행 로직 파일
├── images/             # 이미지 폴더
│   ├── scene1_B0.png   # Scene 1, Sharp (B0)
│   ├── scene1_B1.png   # Scene 1, Blur level 1
│   ├── scene1_B2.png   # Scene 1, Blur level 2
│   ├── scene1_B3.png   # Scene 1, Blur level 3
│   ├── scene1_B4.png   # Scene 1, Most blur (B4)
│   ├── scene2_B0.png
│   ├── ...
│   └── scene5_B4.png
└── README.md
```

## 이미지 파일명 규칙
- 패턴: `scene{N}_B{M}.png`
- N: Scene 번호 (1-5)
- M: Blur 레벨 (0-4)
  - B0 = Sharp (가장 선명)
  - B4 = Most blur (가장 흐림)

## 사용법
1. `images/` 폴더에 이미지 25장 넣기 (5 scenes × 5 blur levels)
2. `index.html` 파일을 브라우저로 열기
3. 실험 완료 후 CSV/JSON 다운로드

## 설정 변경
`js/survey-config.js` 파일 내 `SURVEY_CONFIG` 객체에서 수정 가능:

```javascript
window.SURVEY_CONFIG = {
    imageFolder: './images/',           // 이미지 폴더 경로
    imagePattern: 'scene{scene}_B{blur}.png',  // 파일명 패턴
    numScenes: 5,                        // Scene 개수
    blurLevels: [0, 1, 2, 3, 4],         // Blur 레벨
    groundTruth: {                       // 각 scene의 실제 방향
        1: 'right',
        2: 'left',
        // ...
    }
};
```

  ## 문항 텍스트 변경
  문항/안내/버튼 문구는 `js/survey-texts.js`에서 수정합니다.

  - intro: 시작 화면 안내 문구
  - trial: 방향 문항, 확신도 문항, 버튼/라벨 텍스트
  - results: 완료 화면 텍스트

## 출력 데이터 형식
CSV 컬럼:
- participantId: 참가자 ID (자동 생성)
- trialIndex: 시행 번호
- scene: Scene 번호 (1-5)
- blurLevel: Blur 레벨 (0-4)
- groundTruth: 실제 방향
- response: 응답 (left/right)
- confidence: 확신도 (1-4)
- correct: 정답 여부 (0/1)
- timestamp: 응답 시간

## 분석 예시 (Python)
```python
import pandas as pd

df = pd.read_csv('pilot_results_P1234567890.csv')

# Blur level별 정답률
accuracy_by_blur = df.groupby('blurLevel')['correct'].mean()
print(accuracy_by_blur)

# Blur level별 평균 확신도
confidence_by_blur = df.groupby('blurLevel')['confidence'].mean()
print(confidence_by_blur)
```
