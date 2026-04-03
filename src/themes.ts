export interface Theme {
  name: string;
  bg: string;         // canvas background
  wallVis: string;    // wall in FOV
  wallSeen: string;   // wall explored but not visible
  floorVis: string;   // floor in FOV
  floorSeen: string;  // floor explored but not visible
  stairsVis: string;  // stairs in FOV
  stairsSeen: string; // stairs explored but not visible
  player: string;     // @ glyph
  accent: string;     // title, highlights, selected key colors
  ui: string;         // HUD / menu body text
  uiDim: string;      // secondary / subtitle text
  border: string;     // decorative separator lines
  prompt: string;     // blinking "press start" text
}

export const THEMES: Theme[] = [
  {
    name: 'Classic',
    bg:          '#000000',
    wallVis:     '#555555',
    wallSeen:    '#222222',
    floorVis:    '#333333',
    floorSeen:   '#191919',
    stairsVis:   '#ffff88',
    stairsSeen:  '#555544',
    player:      '#ffffff',
    accent:      '#ffff88',
    ui:          '#aaaaaa',
    uiDim:       '#555555',
    border:      '#333333',
    prompt:      '#44ff44',
  },
  {
    // Original Game Boy 4-shade green palette
    name: 'Pea Soup',
    bg:          '#0f380f',
    wallVis:     '#8bac0f',
    wallSeen:    '#306230',
    floorVis:    '#306230',
    floorSeen:   '#1a2f1a',
    stairsVis:   '#9bbc0f',
    stairsSeen:  '#306230',
    player:      '#9bbc0f',
    accent:      '#9bbc0f',
    ui:          '#8bac0f',
    uiDim:       '#306230',
    border:      '#306230',
    prompt:      '#9bbc0f',
  },
  {
    // Amber phosphor CRT monitor
    name: 'Amber',
    bg:          '#0d0700',
    wallVis:     '#cc7700',
    wallSeen:    '#3d2200',
    floorVis:    '#4d2e00',
    floorSeen:   '#1a0f00',
    stairsVis:   '#ffaa00',
    stairsSeen:  '#5c3d00',
    player:      '#ffcc44',
    accent:      '#ffaa00',
    ui:          '#cc7700',
    uiDim:       '#5c3d00',
    border:      '#3d2200',
    prompt:      '#ffcc44',
  },
  {
    // Deep red, blood moon aesthetic
    name: 'Blood Moon',
    bg:          '#0d0000',
    wallVis:     '#882222',
    wallSeen:    '#330000',
    floorVis:    '#3d0f0f',
    floorSeen:   '#1a0000',
    stairsVis:   '#ff4444',
    stairsSeen:  '#661111',
    player:      '#ffaaaa',
    accent:      '#ff4444',
    ui:          '#cc4444',
    uiDim:       '#661111',
    border:      '#440000',
    prompt:      '#ff6666',
  },
  {
    // Cold blue oceanic
    name: 'Oceanic',
    bg:          '#00050d',
    wallVis:     '#225588',
    wallSeen:    '#001133',
    floorVis:    '#0f2233',
    floorSeen:   '#00080f',
    stairsVis:   '#44aaff',
    stairsSeen:  '#113355',
    player:      '#aaddff',
    accent:      '#44aaff',
    ui:          '#5599cc',
    uiDim:       '#113355',
    border:      '#112244',
    prompt:      '#66ccff',
  },
  {
    // Purple amethyst
    name: 'Amethyst',
    bg:          '#08000d',
    wallVis:     '#664488',
    wallSeen:    '#220033',
    floorVis:    '#2b0f3d',
    floorSeen:   '#0f0019',
    stairsVis:   '#cc66ff',
    stairsSeen:  '#552266',
    player:      '#eeccff',
    accent:      '#cc66ff',
    ui:          '#9955bb',
    uiDim:       '#442255',
    border:      '#330055',
    prompt:      '#dd88ff',
  },
  {
    // Warm copper / sepia
    name: 'Copper',
    bg:          '#0a0600',
    wallVis:     '#996633',
    wallSeen:    '#3d2200',
    floorVis:    '#3d2800',
    floorSeen:   '#150d00',
    stairsVis:   '#ffaa55',
    stairsSeen:  '#663300',
    player:      '#ffd699',
    accent:      '#ffaa55',
    ui:          '#cc8844',
    uiDim:       '#664422',
    border:      '#442200',
    prompt:      '#ffcc88',
  },
];
