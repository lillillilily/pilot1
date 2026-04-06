window.SURVEY_CONFIG = {
    imageFolder: './images/',

    // Legacy fallback for the original 5-scene demo structure.
    imagePattern: 'scene{scene}_B{blur}.png',
    numScenes: 5,
    blurLevels: [0, 1, 2, 3, 4],

    // Current workspace image layout.
    blurFolders: ['B00', 'B01', 'B02', 'B03', 'B04'],
    sceneFiles: [
        'bus_000010.png',
        'camel_000065.png',
        'car-roundabout_000056.png',
        'car-turn_000030.png',
        'dance-jump_000000.png',
        'drift-straight_000007.png',
        'flamingo_000075.png',
        'hockey_000011.png',
        'mallard-fly_000010.png',
        'paragliding-launch_000044.png',
        'parkour_000082.png',
        'soccerball_000037.png',
        'swing_000050.png',
        'train_000065.png'
    ],

    // Fill this in if you want automatic correctness scoring.
    groundTruth: {}
};
