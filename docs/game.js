// Upgradex web version.
// Mechanics are based on the Upgradex wiki (Main baseplate, layer 1).
// Where the wiki does not give a cost formula, an assumption is noted below.

(() => {
  const SAVE_KEY = 'upgradex-web-v1';
  const SAVE_INTERVAL_MS = 5000;

  // ---------- State ----------
  const state = {
    credits: 0,
    lv: {},           // upgrade id -> level bought
    growthTime: 0,    // seconds since "Grows overtime" (#10) was bought
  };

  const lv = (id) => state.lv[id] || 0;

  // Tags per upgrade, copied from the Main baseplate table on the wiki.
  // First tag = colour group, second = currency group (Credits-*).
  const TAGS = {
    '1': ['Blue', 'Credits-Blue'],
    '2': ['Green', 'Credits-Green'],
    '3': ['Green', 'Credits-Green'],
    '4': ['Orange', 'Credits-Orange'],
    '5': ['Orange', 'Credits-Orange'],
    '6': ['Red', 'Credits-Red'],
    '7': ['Red', 'Credits-Red'],
    '9': ['Red', 'Credits-Red'],
    '10': ['Green', 'Credits-Green'],
    '11': ['Orange', 'Credits-Orange'],
    '12': ['Purple', 'Credits-Purple'],
  };

  // Synergism (#5) counts every bought upgrade that has a Credits-* tag (from TAGS).
  const CREDITS_IDS = Object.keys(TAGS).filter((id) => TAGS[id].some((t) => t.startsWith('Credits-')));
  const countSynergy = () => CREDITS_IDS.filter((id) => lv(id) > 0).length;

  // ---------- Upgrade definitions (Main, layer 1) ----------
  // cap(): max level. cost(level): credits needed to buy the next level.
  const UPGRADES = [
    {
      id: '1', title: 'New shore', cap: () => 1, cost: () => 0,
      desc: 'Start generating 1/s Credits every second.',
    },
    {
      // Cost from the wiki formula: (3L^2 - 3L + 10) / 2, where L = current level.
      id: '2', title: 'Addition', cap: () => 3 + 3 * lv('6'), cost: (l) => (3 * l * l - 3 * l + 10) / 2,
      desc: () => `+${1 + lv('7')}/s Credits per level. Additions are applied to the base amount.`,
    },
    {
      // Wiki cap "3 (+47)" = 50 total; #9 adds +27.
      // Cost past level 3: 2.083L^2 + 83.94L - 53.43 (L = current level). Levels 0-3 are still assumed: 25*(L+1).
      id: '3', title: 'Stronger addition', cap: () => 50 + 27 * lv('9'),
      cost: (l) => (l >= 3 ? Math.ceil(2.083 * l * l + 83.94 * l - 53.43) : 25 * (l + 1)),
      desc: '+3/s Credits per level.',
    },
    {
      id: '4', title: 'Multiplication', cap: () => 1, cost: () => 50,
      desc: '×2 Credits gain. Multipliers are applied after additions.',
    },
    {
      id: '5', title: 'Synergism', cap: () => 1, cost: () => 250,
      desc: '×1.1 Credits gain for every upgrade with a Credits tag.',
    },
    {
      id: '6', title: 'Extender', cap: () => 4, cost: (l) => 125 * 2 ** l,
      desc: 'Increases the level cap of upgrade #2 by +3 per level.',
    },
    {
      id: '7', title: 'Full potential', cap: () => 1, cost: () => 500,
      desc: 'Increases upgrade #2\'s boost per level by +1/s.',
    },
    {
      id: '9', title: 'Super-spending', cap: () => 1, cost: () => 15000,
      desc: 'Increases the level cap of upgrade #3 by +27.',
    },
    {
      id: '10', title: 'Grows overtime', cap: () => 1, cost: () => 25000,
      desc: '+50/s Credits, growing by +1/s every second. Resets on Research (not implemented yet).',
    },
    {
      id: '11', title: 'Exponentiation', cap: () => 10, cost: (l) => 25000 * 2 ** l,
      desc: '×1.2 Credits gain per level, compounding.',
    },
    {
      id: '12', title: 'Ultra', cap: () => 1, cost: () => 1e9,
      desc: 'Credits gain ^1.1. Exponents are applied after multipliers.',
    },
  ];

  // ---------- Economy ----------
  function creditsPerSecond() {
    let base = lv('1') * 1;
    base += lv('2') * (1 + lv('7'));
    base += lv('3') * 3;
    if (lv('10')) base += 50 + state.growthTime;

    let mult = 1;
    if (lv('4')) mult *= 2;
    if (lv('5')) mult *= 1.1 ** countSynergy();
    mult *= 1.2 ** lv('11');

    let gain = base * mult;
    if (lv('12') && gain > 1) gain = gain ** 1.1;
    return gain;
  }

  function buy(def) {
    const level = lv(def.id);
    if (level >= def.cap()) return;
    const price = def.cost(level);
    if (state.credits < price) return;
    state.credits -= price;
    state.lv[def.id] = level + 1;
    if (def.id === '10' && level === 0) state.growthTime = 0;
    render();
    save();
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
    upgrades: document.getElementById('upgrades'),
    status: document.getElementById('status'),
    save: document.getElementById('save-btn'),
    reset: document.getElementById('reset-btn'),
  };

  const cards = new Map();

  function buildCards() {
    els.upgrades.innerHTML = '';
    for (const def of UPGRADES) {
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
      card.addEventListener('click', () => buy(def));
      els.upgrades.appendChild(card);
      cards.set(def.id, card);
    }
  }

  function render() {
    els.credits.textContent = fmt(state.credits);
    els.rate.textContent = `${fmt(creditsPerSecond())}/s`;

    for (const def of UPGRADES) {
      const card = cards.get(def.id);
      const level = lv(def.id);
      const cap = def.cap();
      const maxed = level >= cap;
      const price = maxed ? 0 : def.cost(level);
      const affordable = !maxed && state.credits >= price;

      card.classList.toggle('maxed', maxed);
      card.classList.toggle('disabled', !maxed && !affordable);

      card.querySelector('.card-desc').textContent =
        typeof def.desc === 'function' ? def.desc() : def.desc;
      card.querySelector('.level').textContent = `Lv ${level}/${cap}`;

      const costEl = card.querySelector('.cost');
      if (maxed) {
        costEl.textContent = 'MAX';
        costEl.className = 'cost free';
      } else {
        costEl.textContent = price === 0 ? 'Free!' : `${fmt(price)} Cr`;
        costEl.className = price === 0 ? 'cost free' : 'cost';
      }
    }
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
      state.lv = data.lv && typeof data.lv === 'object' ? data.lv : {};
      state.growthTime = Number(data.growthTime) || 0;
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
    state.credits += creditsPerSecond() * dt;

    saveTimer += dt * 1000;
    if (saveTimer >= SAVE_INTERVAL_MS) {
      saveTimer = 0;
      save(true);
    }

    render();
    requestAnimationFrame(tick);
  }

  // ---------- Init ----------
  els.save.addEventListener('click', save);
  els.reset.addEventListener('click', () => {
    if (!confirm('Reset your save? This cannot be undone.')) return;
    state.credits = 0;
    state.lv = {};
    state.growthTime = 0;
    save();
    render();
  });

  load();
  buildCards();
  render();
  requestAnimationFrame(tick);
})();
