window.SURVEY_TEXTS = {
    pageTitle: 'Motion Perception Pilot Study',
    heading: 'Motion Perception Study',
    subtitle: 'Single Image Motion Direction Judgment',
    progressStart: '시작하려면 아래 버튼을 클릭하세요',
    progressDone: '완료!',

    intro: {
        title: '실험 안내',
        description: '본 실험은 이미지 속 물체의 <strong>이동 방향</strong>을 판단하는 과제입니다.',
        bullets: [
            '각 이미지에서 <strong>표시된 물체</strong>의 주된 이동 방향을 판단해주세요.',
            '<strong>상 / 하 / 좌 / 우</strong> 중 하나를 선택합니다.',
            '선택 후, 해당 판단에 대한 <strong>확신도</strong>(1~4)를 표시해주세요.',
            '총 <strong>25개</strong>의 이미지가 제시됩니다. (약 5~10분 소요)'
        ],
        highlight: '⚡ 정답이 없는 실험입니다. 직관적으로 느끼는 대로 응답해주세요.',
        startButton: '실험 시작'
    },

    trial: {
        targetIndicator: '▲ 위 이미지에서 움직이는 물체의 방향을 판단하세요',
        directionQuestion: '표시된 물체의 주된 이동 방향은 무엇입니까?',
        confidenceQuestion: '방금 선택한 방향에 대해 얼마나 확신하십니까?',
        nextButton: '다음',
        direction: {
            up: '위',
            down: '아래',
            left: '왼쪽',
            right: '오른쪽'
        },
        confidenceLabels: ['낮음', '', '', '높음']
    },

    results: {
        title: '✓ 실험 완료!',
        thanks: '참여해주셔서 감사합니다!',
        saveGuide: '아래 버튼을 눌러 결과를 저장해주세요.',
        downloadCSV: '📊 CSV 다운로드',
        downloadJSON: '📁 JSON 다운로드'
    }
};
