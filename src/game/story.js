// "The Quiet Archipelago": the story that frames the game (v1.3).
// The intro film, the six chapters and the finale. Each line with a `vo` id has a narrated voice file
// in public/vo/<id>.mp3, generated from this file by tools/make-vo.mjs (so text and voice never drift).
// Chapter goals read the game state through Game (see StoryMixin) and give the player a clear direction.

export const VOICES = {
  narrator: { voice: 'en-US-AndrewNeural', rate: '-6%', pitch: '-2Hz' },
  ellie: { voice: 'en-GB-SoniaNeural', rate: '-10%', pitch: '-4Hz' },
};

/**
 * Intro film. shot: camera move on the island (see Cinematic in ui/cinematic.js);
 * mood: how the scene is lit (night, storm, dawn, day); letter: shown as a handwritten letter.
 */
export const INTRO = [
  { vo: 'intro1', who: 'narrator', shot: 'high', mood: 'night', text: 'Long ago, the Seven Isles were full of life. Golden fields, busy harbours, and a city that glowed at night.' },
  { vo: 'intro2', who: 'narrator', shot: 'sweep', mood: 'storm', text: 'Then came the Great Storm. The families sailed away to safety... and the islands fell quiet.' },
  { vo: 'intro3', who: 'narrator', shot: 'shore', mood: 'dawn', text: 'Years later, a small boat reaches the shore of Green Village. On board: you, a box of tools, and a letter.' },
  { vo: 'intro4', who: 'ellie', shot: 'plaza', mood: 'dawn', letter: true, text: 'Dear Mayor. The islands are waiting. Build a home, plant a field, and the families will come back. Ellie, the old harbour master.' },
  { vo: 'intro5', who: 'narrator', shot: 'rise', mood: 'day', text: 'One house. One field. One island at a time. Bring the Seven Isles back to life.' },
];

export const STORY_TITLE = 'The Quiet Archipelago';

/**
 * Chapters, in order. goals: [{ text, done(g), progress?(g) -> [have, need], act?, target? }]
 * act: a UI action the goal button runs (opens the right menu); target: the button a hint points at.
 */
export const CHAPTERS = [
  {
    id: 'ch1', vo: 'ch1', title: 'A New Beginning',
    text: 'Every town starts with a single home. Gather wood, raise a house, and plant a farm.',
    goals: [
      { text: 'Tap a tree or rock to gather', done: (g) => g.s.stats.gathered >= 1 },
      { text: 'Build a House', done: (g) => g.countType('rumah') >= 1, act: 'build', target: '[data-act="build"]' },
      { text: 'Build a Farm', done: (g) => g.countType('ladang') + g.countType('nelayan') >= 1, act: 'build', target: '[data-act="build"]' },
    ],
  },
  {
    id: 'ch2', vo: 'ch2', title: 'The First Families',
    text: 'Smoke from a chimney travels far. The first families are coming home. Make room for them, and keep them happy.',
    goals: [
      { text: 'Welcome 6 villagers', done: (g) => g.I.npcs.length >= 6, progress: (g) => [g.I.npcs.length, 6], act: 'build', target: '[data-act="build"]' },
      { text: 'Reach 60% happiness', done: (g) => g.islandHappiness() >= 60, progress: (g) => [Math.round(g.islandHappiness()), 60] },
      { text: 'Finish 3 quests', done: (g) => g.s.quests.done.length >= 3, progress: (g) => [g.s.quests.done.length, 3], act: 'quests', target: '[data-act="quests"]' },
    ],
  },
  {
    id: 'ch3', vo: 'ch3', title: 'Across the Water',
    text: 'From the hill you can see another island on the horizon. It is time to cross the water.',
    goals: [
      { text: 'Unlock a second island', done: (g) => Object.keys(g.s.islands).length >= 2, act: 'map', target: '[data-act="map"]' },
    ],
  },
  {
    id: 'ch4', vo: 'ch4', title: 'Sails on the Horizon',
    text: 'Islands grow stronger together. Build a harbour and send a merchant ship between them.',
    goals: [
      { text: 'Build a Harbor', done: (g) => g.harborIslands().length >= 1, act: 'build', target: '[data-act="build"]' },
      { text: 'Complete a sea voyage', done: (g) => g.s.stats.voyages >= 1, act: 'town-orders', target: '[data-act="town"]' },
    ],
  },
  {
    id: 'ch5', vo: 'ch5', title: 'The Great Works',
    text: 'Now the people dream bigger. Bridges, aqueducts, an academy. Great works for all seven isles.',
    goals: [
      { text: 'Finish a Grand Project stage', done: (g) => g.s.stats.projects >= 1, act: 'town-projects', target: '[data-act="town"]' },
      { text: 'Reach a 3-star island rating', done: (g) => Object.values(g.s.islands).some((I) => (I.starBest || 0) >= 3), act: 'town-rating', target: '[data-act="town"]' },
    ],
  },
  {
    id: 'ch6', vo: 'ch6', title: 'Seven Isles Alive',
    text: 'One by one, the lights return. Reach every island, and the archipelago will live again.',
    goals: [
      { text: 'Unlock all 7 islands', done: (g) => Object.keys(g.s.islands).length >= 7, progress: (g) => [Object.keys(g.s.islands).length, 7], act: 'map', target: '[data-act="map"]' },
    ],
  },
];

export const FINALE = { vo: 'finale', title: 'The Seven Isles Live Again', text: 'The Seven Isles are alive once more. Ellie would be proud. And the story of your islands... is only beginning.' };

/** Every narrated line, for the VO generator. */
export const VO_LINES = [
  ...INTRO.map((l) => ({ id: l.vo, who: l.who, text: l.text })),
  ...CHAPTERS.map((c) => ({ id: c.vo, who: 'narrator', text: c.text })),
  { id: FINALE.vo, who: 'narrator', text: FINALE.text },
];

// ---------------------------------------------------------------- game state (mixed into Game)

export const StoryMixin = {
  initStory() {
    this.s.story ||= { ch: 0, shown: -1, finale: 0, intro: 0 };
  },
  chapter() {
    return CHAPTERS[this.s.story.ch] || null;
  },
  chapterGoals(ch = this.chapter()) {
    if (!ch) return [];
    return ch.goals.map((goal) => ({ ...goal, ok: !!goal.done(this), prog: goal.progress?.(this) }));
  },
  /** Advance through finished chapters; emits 'story:chapter' for each new one and 'story:finale' at the end. */
  checkStory() {
    const S = this.s.story;
    let moved = false;
    while (S.ch < CHAPTERS.length && this.chapterGoals(CHAPTERS[S.ch]).every((goal) => goal.ok)) {
      S.ch++;
      moved = true;
      this.addXp(60 * S.ch);
    }
    if (S.ch >= CHAPTERS.length && !S.finale) {
      S.finale = 1;
      this.emit('story:finale', FINALE);
      return;
    }
    if (S.shown !== S.ch && CHAPTERS[S.ch]) {
      S.shown = S.ch;
      this.emit('story:chapter', { ch: CHAPTERS[S.ch], n: S.ch + 1, moved });
    }
  },
};
