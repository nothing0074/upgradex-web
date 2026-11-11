// Upgradex web version.
// Mechanics are based on the Upgradex wiki (Main, Research, Cube, Core).
// Where the wiki does not give a value, an assumption is noted below.
// Missing or unfinished wiki items are listed in MISSING.txt.

(() => {
  const SAVE_KEY = 'upgradex-web-v1';
  const SAVE_INTERVAL_MS = 5000;

  // ---------- State ----------
  const DEFAULT_WAVE = () => ({ red: 0, orange: 0, yellow: 0, white: 0 });

  const state = {
    credits: 0,
    data: 0,
    energy: 0,        // Core currency (from Research reset, needs #CR)
    lv: {},           // upgrade id -> level bought
    growthTime: 0,    // seconds since "Grows overtime" (#10) was bought
    researchTime: 0,  // seconds since the last Research reset
    clicks: 0,        // Cube clicks
    researches: 0,    // number of Research resets
    wave: DEFAULT_WAVE(),          // Wavelength energy amounts
    waveUnlocked: { white: true }, // Wavelength unlock flags (white is free)
    focus: null,      // focused Wavelength id, or null
  };

  const lv = (id) => state.lv[id] || 0;
  const wave = (id) => state.wave[id] || 0;
  const on = (id, at) => wave(id) >= at;                          // milestone active
  const oom = (x) => (x < 1 ? 0 : Math.floor(Math.log10(x)) + 1); // orders of magnitude, 1 → 1, 10 → 2

  // Tags per upgrade, copied from the wiki tables.
  // First tag = colour group, second = currency or system group.
  const TAGS = {
    '1': ['Blue', 'Credits-Blue'],
    '2': ['Green', 'Credits-Green'],
    '3': ['Green', 'Credits-Green'],
    '4': ['Orange', 'Credits-Orange'],
    '5': ['Orange', 'Credits-Orange'],
    '6': ['Red', 'Credits-Red'],
    '7': ['Red', 'Credits-Red'],
    '8': ['Green', 'Credits-Green'],
    '9': ['Red', 'Credits-Red'],
    '10': ['Green', 'Credits-Green'],
    '11': ['Orange', 'Credits-Orange'],
    '12': ['Purple', 'Credits-Purple'],
    'RSC': ['Blue', 'Credits-Blue'],
    'CB': ['Purple', 'Credits-Purple'],
    '1R': ['Green', 'Research-Green'],
    '2R': ['Blue', 'Research-Blue'],
    '3R': ['Orange', 'Research-Orange'],
    '4R': ['Red', 'Research-Red'],
    '5R': ['Green', 'Research-Green'],
    '6R': ['Orange', 'Research-Orange'],
    '7R': ['Red', 'Research-Red'],
    '8R': ['Orange', 'Research-Orange'],
    '9R': ['Green', 'Research-Green'],
    '10R': ['Blue', 'Research-Blue'],
    '11R': ['Green', 'Research-Green'],
    '12R': ['Green', 'Research-Green'],
    '13R': ['Purple', 'Research-Purple'],
    '14R': ['Orange', 'Research-Orange'],
    '1RB': ['Purple', 'Research-Purple'],
    '2RB': ['Purple', 'Research-Purple'],
    '3RB': ['Purple', 'Research-Purple'],
    'CR': ['Purple', 'Research-Purple'],
    'BTR': ['Blue', 'Research-Blue'],
  };

  // Synergism (#5) counts every bought upgrade that has a Credits-* tag.
  const CREDITS_IDS = Object.keys(TAGS).filter((id) => TAGS[id].some((t) => t.startsWith('Credits-')));
  const countSynergy = () => CREDITS_IDS.filter((id) => lv(id) > 0).length;

  // ---------- Wavelengths (Core) ----------
  // req: Energy needed to unlock (not spent). Milestones are active when the amount reaches `at`.
  const WAVES = [
    { id: 'white', name: 'White', req: 0, milestones: [] },
    { id: 'red', name: 'Red', req: 10, milestones: [
      { name: 'Addition R', at: 10, text: '+20/s Credits per order of magnitude of Red' },
      { name: 'Cap R', at: 1000, text: 'Upgrade #3 cap +20' },
      { name: 'Buff R', at: 5000, text: 'Upgrade #10 growth +2/s²' },
      { name: 'Welfare+', at: 25000, text: 'Upgrade #6R threshold ×5000' },
    ] },
    { id: 'orange', name: 'Orange', req: 1000, milestones: [
      { name: 'Credits O', at: 1000, text: '+0.1× Credits per order of magnitude of Orange' },
      { name: 'Data O', at: 10000, text: '+0.05× Data per order of magnitude of Orange' },
    ] },
    { id: 'yellow', name: 'Yellow', req: 100000, milestones: [
      { name: 'Research Y', at: 10, text: '+1 order of magnitude of effective Credits in Research (from 1B)' },
      { name: 'Prestige Y', at: 100, text: 'Prestige is not implemented' },
      { name: 'Addition Y', at: 1000, text: '+0.5× Data per 3 orders of magnitude' },
      { name: 'Multiplication Y', at: 10000, text: 'Research Y gets +4 orders of magnitude per 3' },
    ] },
  ];
  const waveUnlocked = (id) => !!state.waveUnlocked[id];

  // ---------- Upgrade definitions (Main, layer 1) ----------
  // cap(): max level. cost(level): credits needed to buy the next level.
  // gate(): optional, card is hidden until it returns true.
  const UPGRADES = [
    {
      id: '1', title: 'New shore', cap: () => 1, cost: () => 0,
      desc: 'Start generating 1/s Credits every second.',
    },
    {
      // Cost from the wiki formula: (3L^2 - 3L + 10) / 2, where L = current level.
      id: '2', title: 'Addition', cap: () => 3 + 3 * lv('6'), cost: (l) => (3 * l * l - 3 * l + 10) / 2,
      desc: () => `+${1 + lv('7')}/s Credits per level.`,
    },
    {
      // Wiki cap "3 (+47)" = 50 total; #9 adds +27; Red Wavelength "Cap R" adds +20.
      // Cost past level 3: 2.083L^2 + 83.94L - 53.43. Levels 0-2 are assumed: 25*(L+1).
      id: '3', title: 'Stronger addition', cap: () => 50 + 27 * lv('9') + (on('red', 1000) ? 20 : 0),
      cost: (l) => (l >= 3 ? Math.ceil(2.083 * l * l + 83.94 * l - 53.43) : 25 * (l + 1)),
      desc: () => `+${3 + 5 * lv('4R')}/s Credits per level.`,
    },
    {
      id: '4', title: 'Multiplication', cap: () => 1, cost: () => 50,
      desc: '×2 Credits gain.',
    },
    {
      id: '5', title: 'Synergism', cap: () => 1, cost: () => 250,
      desc: () => `×${(1.1 + 0.1 * lv('7R')).toFixed(2)} Credits gain for every upgrade with a Credits tag.`,
    },
    {
      id: '6', title: 'Extender', cap: () => 4, cost: (l) => 125 * 2 ** l,
      desc: 'Increases the level cap of upgrade #2 by +3 per level.',
    },
    {
      id: '7', title: 'Full potential', cap: () => 1, cost: () => 500,
      desc: "Increases upgrade #2's boost per level by +1/s.",
    },
    {
      // Unlocked by Research #2R. Cost formula from the wiki: 3000 * 5^(L^0.9).
      // Reward per level (+2 Data per Research reset) is an assumption.
      id: '8', title: 'For science', cap: () => 5, cost: (l) => 3000 * 5 ** (l ** 0.9),
      gate: () => lv('2R') > 0,
      desc: '+2 Data on Research reset per level.',
    },
    {
      id: '9', title: 'Super-spending', cap: () => 1, cost: () => 15000,
      desc: 'Increases the level cap of upgrade #3 by +27.',
    },
    {
      id: '10', title: 'Grows overtime', cap: () => 1, cost: () => 25000,
      desc: () => `+50/s Credits, growing by +${growthRate()}/s every second. Resets on Research.`,
    },
    {
      id: '11', title: 'Exponentiation', cap: () => 10, cost: (l) => 25000 * 2 ** l,
      desc: '×1.2 Credits gain per level, compounding.',
    },
    {
      id: '12', title: 'Ultra', cap: () => 1, cost: () => 1e9,
      desc: 'Credits gain ^1.1. Exponents are applied after multipliers.',
    },
    {
      id: 'RSC', title: 'Breakthrough', cap: () => 1, cost: () => 1000,
      desc: 'Unlocks the Research baseplate.',
    },
    {
      id: 'CB', title: 'BFFs', cap: () => 25, cost: (l) => 50000 * 1.55 ** l,
      desc: 'Unlocks the Cube. Each level gives +1 Cube click gain.',
    },
  ];

  // ---------- Research baseplate (layer 1) ----------
  // Costs are in Data. cost() returning Infinity means the wiki gives no cost (cannot be bought).
  // impl: false marks effects that depend on systems not built yet.
  const RESEARCH = [
    { id: '1R', title: 'Headstart', cap: () => 5, cost: (l) => 1 + l,
      desc: () => `+${15 * lv('1R')}/s Credits (+15 per level).` },
    { id: '2R', title: 'Expansion', cap: () => 1, cost: () => 2,
      desc: 'Unlocks Main #8 (For science).' },
    { id: '3R', title: 'Innovate', cap: () => 50, cost: (l) => (l < 50 ? 2 * 1.25 ** l : 250000 * 1.5 ** (l - 50)),
      desc: '+0.5× Credits gain per level. The first level starts at ×2.' },
    { id: '4R', title: 'Adding addition', cap: () => 1, cost: () => 15,
      desc: "Upgrade #3's boost per level is +5/s." },
    { id: '5R', title: 'Cubing it', cap: () => 3, cost: () => 15,
      desc: '+1 Cube click gain per level.' },
    { id: '6R', title: 'Welfare', cap: () => 1, cost: () => 10,
      desc: '×4 Credits gain while you have less than 1M Credits (more with Red Wavelength).' },
    { id: '7R', title: 'Strong memory', cap: () => 1, cost: () => 60,
      desc: "Upgrade #5's multiplier per upgrade is +0.1 higher." },
    { id: '8R', title: 'Devotion', cap: () => 1, cost: () => 50,
      desc: '×2 Credits and Data gain while research time is above 30s.' },
    { id: '9R', title: 'Passive shock', cap: () => 1, cost: () => 300, impl: false,
      desc: 'Passive Energy gain.' },
    { id: '10R', title: 'Expansion... 2!', cap: () => 1, cost: () => 200, impl: false,
      desc: 'Adds more Blue upgrades (#12 & #13).' },
    { id: '11R', title: 'Glamour', cap: () => 10, cost: (l) => 250 * 2 ** l, impl: false,
      desc: 'Prestige gain on Prestige reset.' },
    { id: '12R', title: 'Expansion 3!!!', cap: () => 1, cost: () => 500,
      desc: 'Unlocks the Core upgrades (Energetic, Sunlit, Infrared).' },
    { id: '13R', title: 'Flashy', cap: () => 10, cost: () => Infinity, impl: false,
      desc: 'Ascension gain on Ascension reset. Cost is missing on the wiki.' },
    { id: '14R', title: 'Recursion', cap: () => 1, cost: () => Infinity, impl: false,
      desc: 'Data gain is boosted by unspent Data. Cost is missing on the wiki.' },
    { id: '1RB', title: 'Power clicks', cap: () => 1, cost: () => 1, impl: false,
      desc: 'Unlocks Buy Max.' },
    { id: '2RB', title: 'Life qualities', cap: () => 1, cost: () => 3, impl: false,
      desc: 'Unlocks Shortcuts.' },
    { id: '3RB', title: 'Tinkering', cap: () => 1, cost: () => 25, impl: false,
      desc: 'Unlocks the Computer.' },
    { id: 'CR', title: 'Electric hum', cap: () => 1, cost: () => 25,
      desc: 'Unlocks the Core and Energy.' },
    { id: 'BTR', title: 'Shattered', cap: () => 1, cost: () => Infinity, impl: false,
      desc: 'Unlocks Breakthrough. Cost is missing on the wiki.' },
  ];

  // ---------- Core upgrades (cost in Energy) ----------
  // Shown after Research #12R. Assumed to persist through Research resets.
  const CORE_UPGRADES = [
    { id: 'ENE', title: 'Energetic', cap: () => 3, cost: (l) => 1000 * 5 ** l,
      gate: () => lv('12R') > 0,
      desc: () => `Passive Energy gain +${(0.25 * lv('ENE')).toFixed(2)}%/s (of current Energy).` },
    { id: 'SUN', title: 'Sunlit', cap: () => 4, cost: (l) => 100 * 100 ** l,
      gate: () => lv('12R') > 0,
      desc: 'Multiplies White gain by the gap to your highest Wavelength, at a reduced rate.' },
    { id: 'INF', title: 'Infrared', cap: () => 5, cost: (l) => 1000 * 100 ** l,
      gate: () => lv('12R') > 0,
      desc: '+1/s base White gain per level.' },
  ];

  // ---------- Economy ----------
  // Upgrade #10 grows at 1/s, or 3/s with Red "Buff R".
  function growthRate() { return 1 + (on('red', 5000) ? 2 : 0); }

  // Upgrade #6R threshold, raised by Red "Welfare+".
  function welfareThreshold() { return 1e6 * (on('red', 25000) ? 5000 : 1); }

  function creditsPerSecond() {
    let base = lv('1') * 1;
    base += lv('2') * (1 + lv('7'));
    base += lv('3') * (3 + 5 * lv('4R'));   // #4R: upgrade #3 gets +5/s per level
    if (lv('10')) base += 50 + growthRate() * state.growthTime;
    base += lv('1R') * 15;                  // #1R Headstart
    if (on('red', 10)) base += 20 * oom(wave('red')); // Red "Addition R"

    let mult = 1;
    if (lv('4')) mult *= 2;
    if (lv('5')) mult *= (1.1 + 0.1 * lv('7R')) ** countSynergy(); // #7R: +0.1 per upgrade
    mult *= 1.2 ** lv('11');
    if (lv('3R')) mult *= 1 + 0.5 * (lv('3R') + 1); // #3R: first level ×2, +0.5 per level
    if (lv('6R') && state.credits < welfareThreshold()) mult *= 4; // #6R Welfare
    if (lv('8R') && state.researchTime > 30) mult *= 2; // #8R Devotion
    if (on('orange', 1000)) mult *= 1 + 0.1 * oom(wave('orange')); // Orange "Credits O"
    mult *= cubeCreditsBoost();

    let gain = base * mult;
    if (lv('12') && gain > 1) gain = gain ** 1.1;
    return gain;
  }

  // ---------- Cube ----------
  // Cube click gain per click: +1 per BFFs level, plus Cubing it (#5R).
  function cubeClickGain() {
    return 1 + lv('CB') + lv('5R');
  }

  // Cube boosts from the wiki. Credits boost starts at 10 clicks, Data boost at 100.
  // The Prestige boost (needs #6P) is not implemented.
  function cubeCreditsBoost() {
    if (state.clicks < 10) return 1;
    return 0.25 + (state.clicks / 10) ** 0.175;
  }

  function cubeDataBoost() {
    if (state.clicks < 100) return 1;
    return 0.125 + (state.clicks / 100) ** 0.125;
  }

  // Tunable values (editable in dev mode).
  // Crit multiplier ×5 is assumed, the wiki does not give one.
  const CONFIG = { critMult: 5 };

  // Starters milestone (25 clicks) gives a 5% crit chance.
  function cubeCritChance() {
    return state.clicks >= 25 ? 0.05 : 0;
  }

  function cubeClickAction() {
    if (!lv('CB')) return;
    let gain = cubeClickGain();
    if (Math.random() < cubeCritChance()) gain *= CONFIG.critMult;
    state.clicks += gain;
    render();
  }

  // ---------- Core: Wavelengths ----------
  // Sunlit: White gain × (1 + log10((max+1)/(white+1))^(level × 0.05)).
  function sunlitMult() {
    const l = lv('SUN');
    if (!l) return 1;
    const max = Math.max(...Object.values(state.wave));
    const cur = wave('white');
    if (max <= cur) return 1;
    return 1 + Math.log10((max + 1) / (cur + 1)) ** (l * 0.05);
  }

  // Focused Wavelength gains 1/s (assumption, the wiki gives no rate).
  // White gains (1 + Infrared levels) × Sunlit multiplier.
  function waveTick(dt) {
    const f = state.focus;
    if (!f || !waveUnlocked(f)) return;
    let rate = 1;
    if (f === 'white') rate = (1 + lv('INF')) * sunlitMult();
    state.wave[f] = wave(f) + rate * dt;
  }

  // Research Y adds orders of magnitude to effective Credits, from 1B.
  function researchBaseCredits() {
    let c = state.credits;
    if (c >= 1e9) {
      let extra = 0;
      if (on('yellow', 10)) extra += oom(wave('yellow'));
      if (on('yellow', 10000)) extra += 4 * Math.floor(oom(wave('yellow')) / 3);
      c *= 10 ** extra;
    }
    return c;
  }

  // Data multipliers from Wavelengths (Orange "Data O", Yellow "Addition Y").
  function dataWaveMult() {
    let m = 1;
    if (on('orange', 10000)) m *= 1 + 0.05 * oom(wave('orange'));
    if (on('yellow', 1000)) m *= 1 + 0.5 * Math.floor(oom(wave('yellow')) / 3);
    return m;
  }

  // ---------- Research ----------
  // Data gained by a Research reset (wiki: (Credits/500)^0.25, needs at least 500 Credits).
  function pendingData() {
    if (state.credits < 500) return 0;
    let d = (researchBaseCredits() / 500) ** 0.25;
    if (lv('8R') && state.researchTime > 30) d *= 2; // #8R Devotion
    return d * cubeDataBoost() * dataWaveMult();
  }

  // Items kept on Research reset: Research items (R / RB), unlock flags, Cube, and Core upgrades.
  // Main upgrades are reset (assumption, the wiki does not say which persist).
  // Wavelength amounts are kept (assumption).
  function keepOnResearch(id) {
    return /R(B)?$/.test(id) || ['RSC', 'CB', 'CR', 'BTR', 'ENE', 'SUN', 'INF'].includes(id);
  }

  // ---------- Buying ----------
  function buy(def) {
    const level = lv(def.id);
    if (level >= def.cap()) return;
    const price = def.cost(level);
    if (state.credits < price) return;
    state.credits -= price;
    state.lv[def.id] = level + 1;
    if (def.id === '10' && level === 0) state.growthTime = 0;
    render();
    save(true);
  }

  function buyResearch(def) {
    if (!lv('RSC')) return;
    const level = lv(def.id);
    if (level >= def.cap()) return;
    const price = def.cost(level);
    if (price === Infinity || state.data < price) return;
    state.data -= price;
    state.lv[def.id] = level + 1;
    render();
    save(true);
  }

  function buyCore(def) {
    if (!lv('12R')) return;
    const level = lv(def.id);
    if (level >= def.cap()) return;
    const price = def.cost(level);
    if (state.energy < price) return;
    state.energy -= price;
    state.lv[def.id] = level + 1;
    render();
    save(true);
  }

  // Unlock (one-time, Energy is only a requirement) or focus a Wavelength.
  function waveAction(w) {
    if (!waveUnlocked(w.id)) {
      if (state.energy < w.req) {
        flash(`Needs ${fmt(w.req)} Energy`);
        return;
      }
      state.waveUnlocked[w.id] = true;
    } else {
      state.focus = state.focus === w.id ? null : w.id;
    }
    render();
    save(true);
  }

  // Research reset: convert Credits to Data, keep Research upgrades and unlocks.
  function doResearch() {
    if (!lv('RSC')) return;
    const base = pendingData();
    if (base <= 0) {
      flash('Need 500+ Credits to research');
      return;
    }
    const gained = base + 2 * lv('8'); // #8: +2 Data per level
    if (!confirm(`Research reset: gain ${fmt(gained)} Data and clear Credits and Main upgrades?`)) return;
    state.data += gained;
    if (lv('CR')) state.energy += gained; // Core: Energy matches Data gained (assumption)
    state.credits = 0;
    state.lv = Object.fromEntries(Object.entries(state.lv).filter(([id]) => keepOnResearch(id)));
    state.growthTime = 0;
    state.researchTime = 0;
    state.researches += 1;
    render();
    save(true);
  }

  // ---------- Formatting ----------
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 10) return n.toFixed(2);
    if (n < 1e6) return Math.floor(n).toLocaleString();
    return n.toExponential(2).replace('+', '');
  }

  // ---------- DOM ----------
  const els = {
    credits: document.getElementById('credits'),
    rate: document.getElementById('rate'),
    data: document.getElementById('data'),
    dataPanel: document.getElementById('data-panel'),
    upgrades: document.getElementById('upgrades'),
    research: document.getElementById('research'),
    researchPanel: document.getElementById('research-panel'),
    researchBtn: document.getElementById('research-btn'),
    cubePanel: document.getElementById('cube-panel'),
    clicks: document.getElementById('clicks'),
    clickGain: document.getElementById('click-gain'),
    cubeBtn: document.getElementById('cube-btn'),
    cubeBoosts: document.getElementById('cube-boosts'),
    corePanel: document.getElementById('core-panel'),
    energy: document.getElementById('energy'),
    waves: document.getElementById('wavelengths'),
    coreUpgrades: document.getElementById('core-upgrades'),
    coreUpgradesBox: document.getElementById('core-upgrades-box'),
    status: document.getElementById('status'),
    save: document.getElementById('save-btn'),
    reset: document.getElementById('reset-btn'),
    devBtn: document.getElementById('dev-btn'),
    devPanel: document.getElementById('dev-panel'),
  };

  const cards = new Map();
  const researchCards = new Map();
  const coreCards = new Map();
  const waveCards = new Map();

  function makeCard(def, onClick) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-head">
        <span class="card-title">${def.title}</span>
        <span class="card-index">#${def.id}</span>
      </div>
      <div class="tags"></div>
      <div class="card-desc"></div>
      <div class="card-foot">
        <span class="level"></span>
        <span class="cost"></span>
      </div>`;
    const tagBox = card.querySelector('.tags');
    for (const tag of TAGS[def.id] || []) {
      const chip = document.createElement('span');
      chip.className = `tag-chip tag-${tag.split('-')[0].toLowerCase()}`;
      chip.textContent = tag;
      tagBox.appendChild(chip);
    }
    if (def.impl === false) {
      const note = document.createElement('span');
      note.className = 'tag-chip tag-note';
      note.textContent = 'not implemented';
      tagBox.appendChild(note);
    }
    card.addEventListener('click', () => onClick(def));
    return card;
  }

  function buildCards() {
    els.upgrades.innerHTML = '';
    for (const def of UPGRADES) {
      const card = makeCard(def, buy);
      els.upgrades.appendChild(card);
      cards.set(def.id, card);
    }
  }

  function buildResearchCards() {
    els.research.innerHTML = '';
    for (const def of RESEARCH) {
      const card = makeCard(def, buyResearch);
      els.research.appendChild(card);
      researchCards.set(def.id, card);
    }
  }

  function buildCoreCards() {
    els.coreUpgrades.innerHTML = '';
    for (const def of CORE_UPGRADES) {
      const card = makeCard(def, buyCore);
      els.coreUpgrades.appendChild(card);
      coreCards.set(def.id, card);
    }
  }

  function buildWaveCards() {
    els.waves.innerHTML = '';
    for (const w of WAVES) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-head">
          <span class="card-title">${w.name} Wavelength</span>
          <span class="card-index">${w.id}</span>
        </div>
        <div class="card-desc"></div>
        <div class="card-foot">
          <span class="level"></span>
          <button type="button" class="wave-btn"></button>
        </div>`;
      card.querySelector('.wave-btn').addEventListener('click', () => waveAction(w));
      els.waves.appendChild(card);
      waveCards.set(w.id, card);
    }
  }

  function setCardText(card, def, level, cap, price, currency) {
    card.querySelector('.card-desc').textContent =
      typeof def.desc === 'function' ? def.desc() : def.desc;
    card.querySelector('.level').textContent = `Lv ${level}/${cap}`;
    const costEl = card.querySelector('.cost');
    if (level >= cap) {
      costEl.textContent = 'MAX';
      costEl.className = 'cost free';
    } else if (price === Infinity) {
      costEl.textContent = '???';
      costEl.className = 'cost';
    } else if (price === 0) {
      costEl.textContent = 'Free!';
      costEl.className = 'cost free';
    } else {
      costEl.textContent = `${fmt(price)} ${currency}`;
      costEl.className = 'cost';
    }
  }

  // Shared card rendering for Main, Research and Core lists.
  function renderCardList(defs, map, have, currency) {
    for (const def of defs) {
      const card = map.get(def.id);
      if (!card) continue;
      const level = lv(def.id);
      const cap = def.cap();
      const maxed = level >= cap;
      const price = maxed ? 0 : def.cost(level);
      const affordable = !maxed && price !== Infinity && have >= price;
      card.hidden = !!def.gate && !def.gate();
      card.classList.toggle('maxed', maxed);
      card.classList.toggle('disabled', !maxed && !affordable);
      setCardText(card, def, level, cap, price, currency);
    }
  }

  function renderWaves() {
    for (const w of WAVES) {
      const card = waveCards.get(w.id);
      const unlocked = waveUnlocked(w.id);
      const focused = state.focus === w.id;
      const lines = w.milestones.map((m) => {
        const active = on(w.id, m.at);
        return `<div class="${active ? '' : 'muted'}">${active ? '✓' : '·'} ${m.name} (${fmt(m.at)}): ${m.text}</div>`;
      });
      card.querySelector('.card-desc').innerHTML = lines.join('') || 'No milestones.';
      card.querySelector('.level').textContent =
        `Amount: ${fmt(wave(w.id))}${focused ? ' · focused' : ''}`;
      const btn = card.querySelector('.wave-btn');
      if (!unlocked) {
        btn.textContent = `Unlock (${fmt(w.req)} Energy)`;
        btn.disabled = state.energy < w.req;
      } else {
        btn.textContent = focused ? 'Unfocus' : 'Focus';
        btn.disabled = false;
      }
      card.classList.toggle('disabled', !unlocked && state.energy < w.req);
    }
  }

  function render() {
    els.credits.textContent = fmt(state.credits);
    els.rate.textContent = `${fmt(creditsPerSecond())}/s`;
    els.data.textContent = fmt(state.data);

    const researchOn = lv('RSC') > 0;
    els.dataPanel.hidden = !researchOn;
    els.researchPanel.hidden = !researchOn;
    els.researchBtn.disabled = !researchOn;

    els.cubePanel.hidden = !lv('CB');
    els.clicks.textContent = fmt(state.clicks);
    els.clickGain.textContent = `+${fmt(cubeClickGain())}/click`;
    els.cubeBoosts.textContent =
      `Credits ×${cubeCreditsBoost().toFixed(2)} · Data ×${cubeDataBoost().toFixed(2)} · ` +
      `Crit ${(cubeCritChance() * 100).toFixed(0)}% (×${CONFIG.critMult}) · Milestone: Starters (25 clicks)`;

    els.corePanel.hidden = !lv('CR');
    els.energy.textContent = fmt(state.energy);
    els.coreUpgradesBox.hidden = !lv('12R');
    renderWaves();

    renderCardList(RESEARCH, researchCards, state.data, 'Data');
    renderCardList(UPGRADES, cards, state.credits, 'Cr');
    renderCardList(CORE_UPGRADES, coreCards, state.energy, 'Energy');
  }

  // ---------- Save / load ----------
  function save(silent = false) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (!silent) flash('Saved');
    } catch (e) {
      flash('Save failed');
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.credits = Number(data.credits) || 0;
      state.data = Number(data.data) || 0;
      state.energy = Number(data.energy) || 0;
      state.lv = data.lv && typeof data.lv === 'object' ? data.lv : {};
      state.growthTime = Number(data.growthTime) || 0;
      state.researchTime = Number(data.researchTime) || 0;
      state.clicks = Number(data.clicks) || 0;
      state.researches = Number(data.researches) || 0;
      const w = data.wave && typeof data.wave === 'object' ? data.wave : {};
      state.wave = {
        red: Number(w.red) || 0,
        orange: Number(w.orange) || 0,
        yellow: Number(w.yellow) || 0,
        white: Number(w.white) || 0,
      };
      state.waveUnlocked = { white: true, ...(data.waveUnlocked || {}) };
      state.focus = typeof data.focus === 'string' ? data.focus : null;
    } catch (e) {
      console.warn('Could not load save', e);
    }
  }

  let flashTimer = null;
  function flash(msg) {
    els.status.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (els.status.textContent = ''), 1500);
  }

  // ---------- Loop ----------
  let last = performance.now();
  let saveTimer = 0;

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 1); // cap to avoid jumps when tab is hidden
    last = now;

    if (lv('10')) state.growthTime += dt;
    if (lv('RSC')) state.researchTime += dt;
    state.credits += creditsPerSecond() * dt;
    if (lv('ENE')) state.energy *= 1 + 0.0025 * lv('ENE') * dt; // Energetic (assumption: % of current Energy)
    waveTick(dt);

    saveTimer += dt * 1000;
    if (saveTimer >= SAVE_INTERVAL_MS) {
      saveTimer = 0;
      save(true);
    }

    render();
    if (devOn) refreshDevPanel();
    requestAnimationFrame(tick);
  }

  // ---------- Developer mode ----------
  // Toggle with the DEV button. Lets you edit any value directly.
  // Enabled flag is stored with the save so it survives reloads.
  let devOn = localStorage.getItem('upgradex-dev') === '1';

  function devField(label, get, set, step = 'any') {
    const row = document.createElement('label');
    row.className = 'dev-row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = step;
    input.value = String(get());
    input._get = get;
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) { input.value = String(get()); return; }
      set(v);
      save(true);
      render();
    });
    row.append(name, input);
    return row;
  }

  function devSection(title, rows) {
    const box = document.createElement('div');
    box.className = 'dev-section';
    const h = document.createElement('h3');
    h.textContent = title;
    box.appendChild(h);
    for (const r of rows) box.appendChild(r);
    return box;
  }

  function devButton(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => { onClick(); save(true); render(); });
    return b;
  }

  function buildDevPanel() {
    const box = els.devPanel;
    box.innerHTML = '';

    box.appendChild(devSection('Currencies', [
      devField('Credits', () => state.credits, (v) => (state.credits = v)),
      devField('Data', () => state.data, (v) => (state.data = v)),
      devField('Energy', () => state.energy, (v) => (state.energy = v)),
      devField('Cube clicks', () => state.clicks, (v) => (state.clicks = v)),
      devField('Red wavelength', () => wave('red'), (v) => (state.wave.red = Math.max(0, v))),
      devField('Orange wavelength', () => wave('orange'), (v) => (state.wave.orange = Math.max(0, v))),
      devField('Yellow wavelength', () => wave('yellow'), (v) => (state.wave.yellow = Math.max(0, v))),
      devField('White wavelength', () => wave('white'), (v) => (state.wave.white = Math.max(0, v))),
      devField('Research count', () => state.researches, (v) => (state.researches = v), '1'),
      devField('Research time (s)', () => state.researchTime, (v) => (state.researchTime = v)),
      devField('Growth time (s)', () => state.growthTime, (v) => (state.growthTime = v)),
    ]));

    box.appendChild(devSection('Tunables', [
      devField('Crit multiplier', () => CONFIG.critMult, (v) => (CONFIG.critMult = v)),
    ]));

    const lvRows = [];
    for (const def of [...UPGRADES, ...RESEARCH, ...CORE_UPGRADES]) {
      lvRows.push(devField(`#${def.id} ${def.title}`, () => lv(def.id),
        (v) => {
          const n = Math.max(0, Math.floor(v));
          if (n === 0) delete state.lv[def.id];
          else state.lv[def.id] = n;
        }, '1'));
    }
    box.appendChild(devSection('Upgrade levels (0 = unbought)', lvRows));

    box.appendChild(devSection('Actions', [
      devButton('Unlock everything', () => {
        for (const def of [...UPGRADES, ...RESEARCH, ...CORE_UPGRADES]) state.lv[def.id] = def.cap();
        for (const w of WAVES) state.waveUnlocked[w.id] = true;
      }),
      devButton('Unlock wavelengths', () => {
        for (const w of WAVES) state.waveUnlocked[w.id] = true;
      }),
      devButton('Max credits +1e12', () => (state.credits += 1e12)),
      devButton('Max data +1e6', () => (state.data += 1e6)),
      devButton('Add 100 cube clicks', () => (state.clicks += 100)),
      devButton('Clear all levels', () => (state.lv = {})),
    ]));
  }

  // Update input values from game state, skipping the field being edited.
  function refreshDevPanel() {
    for (const input of els.devPanel.querySelectorAll('input')) {
      if (input === document.activeElement || !input._get) continue;
      input.value = String(input._get());
    }
  }

  function setDevMode(on) {
    devOn = on;
    localStorage.setItem('upgradex-dev', on ? '1' : '0');
    els.devPanel.hidden = !on;
    els.devBtn.classList.toggle('active', on);
    if (on) buildDevPanel();
  }

  // ---------- Init ----------
  els.save.addEventListener('click', () => save());
  els.devBtn.addEventListener('click', () => setDevMode(!devOn));
  els.researchBtn.addEventListener('click', doResearch);
  els.cubeBtn.addEventListener('click', cubeClickAction);
  els.reset.addEventListener('click', () => {
    if (!confirm('Reset your save? This cannot be undone.')) return;
    state.credits = 0;
    state.data = 0;
    state.energy = 0;
    state.lv = {};
    state.growthTime = 0;
    state.researchTime = 0;
    state.clicks = 0;
    state.researches = 0;
    state.wave = DEFAULT_WAVE();
    state.waveUnlocked = { white: true };
    state.focus = null;
    save();
    render();
  });

  load();
  buildCards();
  buildResearchCards();
  buildCoreCards();
  buildWaveCards();
  setDevMode(devOn);
  render();
  requestAnimationFrame(tick);
})();
