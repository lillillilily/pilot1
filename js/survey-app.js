const CONFIG = window.SURVEY_CONFIG;
const TEXTS = window.SURVEY_TEXTS;

let trials = [];
let currentTrialIndex = 0;
let currentResponse = {
    direction: null,
    confidence: null
};
let results = [];
let participantId = 'P' + Date.now();

function initializeTexts() {
    document.title = TEXTS.pageTitle;
    document.getElementById('mainHeading').textContent = TEXTS.heading;
    document.getElementById('mainSubtitle').textContent = TEXTS.subtitle;
    document.getElementById('progressText').textContent = TEXTS.progressStart;

    document.getElementById('introTitle').textContent = TEXTS.intro.title;
    document.getElementById('introDescription').innerHTML = TEXTS.intro.description;

    const bulletList = document.getElementById('introBullets');
    bulletList.innerHTML = '';
    TEXTS.intro.bullets.forEach((bullet) => {
        const li = document.createElement('li');
        li.innerHTML = bullet;
        bulletList.appendChild(li);
    });

    document.getElementById('introHighlight').textContent = TEXTS.intro.highlight;
    document.getElementById('startBtn').textContent = TEXTS.intro.startButton;

    document.getElementById('targetIndicator').textContent = TEXTS.trial.targetIndicator;
    document.getElementById('directionQuestion').textContent = TEXTS.trial.directionQuestion;
    document.getElementById('confidenceQuestion').textContent = TEXTS.trial.confidenceQuestion;

    document.getElementById('labelUp').textContent = TEXTS.trial.direction.up;
    document.getElementById('labelDown').textContent = TEXTS.trial.direction.down;
    document.getElementById('labelLeft').textContent = TEXTS.trial.direction.left;
    document.getElementById('labelRight').textContent = TEXTS.trial.direction.right;

    document.getElementById('confLabel1').textContent = TEXTS.trial.confidenceLabels[0];
    document.getElementById('confLabel2').textContent = TEXTS.trial.confidenceLabels[1];
    document.getElementById('confLabel3').textContent = TEXTS.trial.confidenceLabels[2];
    document.getElementById('confLabel4').textContent = TEXTS.trial.confidenceLabels[3];

    document.getElementById('nextBtn').textContent = TEXTS.trial.nextButton;

    document.getElementById('resultsTitle').textContent = TEXTS.results.title;
    document.getElementById('resultsThanks').textContent = TEXTS.results.thanks;
    document.getElementById('resultsSaveGuide').textContent = TEXTS.results.saveGuide;
    document.getElementById('downloadCsvBtn').textContent = TEXTS.results.downloadCSV;
    document.getElementById('downloadJsonBtn').textContent = TEXTS.results.downloadJSON;
}

function generateTrials() {
    trials = [];
    for (let scene = 1; scene <= CONFIG.numScenes; scene++) {
        for (const blur of CONFIG.blurLevels) {
            trials.push({
                scene: scene,
                blurLevel: blur,
                imagePath: CONFIG.imageFolder + CONFIG.imagePattern
                    .replace('{scene}', scene)
                    .replace('{blur}', blur)
            });
        }
    }

    for (let i = trials.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trials[i], trials[j]] = [trials[j], trials[i]];
    }
}

function startExperiment() {
    generateTrials();
    document.getElementById('introScreen').style.display = 'none';
    document.getElementById('trialScreen').style.display = 'block';
    showTrial();
}

function showTrial() {
    const trial = trials[currentTrialIndex];
    document.getElementById('trialImage').src = trial.imagePath;

    currentResponse = { direction: null, confidence: null };
    document.querySelectorAll('.direction-btn').forEach((btn) => btn.classList.remove('selected'));
    document.querySelectorAll('.confidence-btn').forEach((btn) => btn.classList.remove('selected'));
    document.getElementById('nextBtn').disabled = true;

    const progress = (currentTrialIndex / trials.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('progressText').textContent = `${currentTrialIndex + 1} / ${trials.length}`;
}

function selectDirection(dir) {
    currentResponse.direction = dir;
    document.querySelectorAll('.direction-btn').forEach((btn) => btn.classList.remove('selected'));
    document.getElementById('btn' + dir.charAt(0).toUpperCase() + dir.slice(1)).classList.add('selected');
    checkComplete();
}

function selectConfidence(level) {
    currentResponse.confidence = level;
    document.querySelectorAll('.confidence-btn').forEach((btn, i) => {
        btn.classList.toggle('selected', i + 1 === level);
    });
    checkComplete();
}

function checkComplete() {
    const complete = currentResponse.direction && currentResponse.confidence;
    document.getElementById('nextBtn').disabled = !complete;
}

function nextTrial() {
    const trial = trials[currentTrialIndex];
    results.push({
        participantId: participantId,
        trialIndex: currentTrialIndex + 1,
        scene: trial.scene,
        blurLevel: trial.blurLevel,
        groundTruth: CONFIG.groundTruth[trial.scene] || null,
        response: currentResponse.direction,
        confidence: currentResponse.confidence,
        correct: CONFIG.groundTruth[trial.scene] === currentResponse.direction ? 1 : 0,
        timestamp: new Date().toISOString()
    });

    currentTrialIndex++;

    if (currentTrialIndex >= trials.length) {
        showResults();
    } else {
        showTrial();
    }
}

function showResults() {
    document.getElementById('trialScreen').style.display = 'none';
    document.getElementById('resultsScreen').style.display = 'block';
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressText').textContent = TEXTS.progressDone;
    document.getElementById('resultsPreview').textContent = JSON.stringify(results, null, 2);
}

function downloadCSV() {
    const headers = [
        'participantId',
        'trialIndex',
        'scene',
        'blurLevel',
        'groundTruth',
        'response',
        'confidence',
        'correct',
        'timestamp'
    ];
    const csvRows = [headers.join(',')];

    for (const row of results) {
        csvRows.push(headers.map((h) => row[h] ?? '').join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilot_results_${participantId}.csv`;
    a.click();
}

function downloadJSON() {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilot_results_${participantId}.json`;
    a.click();
}

window.startExperiment = startExperiment;
window.selectDirection = selectDirection;
window.selectConfidence = selectConfidence;
window.nextTrial = nextTrial;
window.downloadCSV = downloadCSV;
window.downloadJSON = downloadJSON;

document.addEventListener('DOMContentLoaded', initializeTexts);
