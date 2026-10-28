# Skill: Native Dock Plugin Synthesis (`create_tab`)

> **Skill Identifier:** `create-tab`  
> **Target Tool:** `create_tab` ({ id, title, icon, html, scope })  
> **Runtime Sandbox:** `<iframe sandbox="allow-scripts" srcdoc="...">` with `window.polymax` bridge.

---

## 1. When to Use This Skill

Inject this skill whenever the user asks the agent to build, synthesize, create, or update an interactive workspace tool:
- "*build a flashcards tool for Stoicism*"
- "*create a comparison matrix for these two papers*"
- "*make a formula cheat sheet for quantum mechanics*"
- "*synthesize a quiz tool based on my notes*"

---

## 2. Strict Architectural & Security Rules

1. **Self-Contained File:**
   - Must be a complete HTML document (`<!DOCTYPE html><html>...</html>`).
   - All CSS must reside in `<style>` tags.
   - All JS must reside in `<script>` tags.
   - **Zero External CDNs:** Never import external `<script src="https://...">` or CSS links. External CDN requests are blocked by Content Security Policy.

2. **Design Tokens & Dark Aesthetic:**
   - Background: `#0A0A0C` (or `var(--bg-canvas)`)
   - Card/Surface: `#131318` (or `var(--bg-surface)`)
   - Border: `#23232E`
   - Primary Accent: `#C8FF57` (neon lime)
   - Secondary Text: `#A0A0B0`
   - Typography: `system-ui, -apple-system, sans-serif` (headers Syne, code Geist Mono).
   - Rounded corners: `12px` to `16px`. Smooth CSS transitions (`0.2s ease`).

3. **Host Bridge Integration (`window.polymax`):**
   The host container automatically exposes the `window.polymax` API:
   ```javascript
   // Read/Write per-tab persistent state:
   await window.polymax.storage.set("cards", cardArray);
   const saved = await window.polymax.storage.get("cards");

   // Access active city notes and context:
   const context = await window.polymax.getContext();

   // Open external URL in Browser dock tab:
   window.polymax.openUrl("https://arxiv.org/abs/2301.12345");

   // Request dock tray expansion:
   window.polymax.ui.expand();
   ```

---

## 3. Canonical Example 1: Interactive Flashcards Micro-App

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Flashcards</title>
  <style>
    :root {
      --bg: #0A0A0C;
      --surface: #131318;
      --surface-hover: #1C1C24;
      --accent: #C8FF57;
      --border: #23232E;
      --text: #F0F0F5;
      --muted: #A0A0B0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      user-select: none;
    }
    .header {
      width: 100%;
      max-width: 480px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      font-size: 14px;
      color: var(--muted);
    }
    .progress-bar {
      flex: 1;
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      margin: 0 16px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent);
      width: 0%;
      transition: width 0.3s ease;
    }
    .card-container {
      width: 100%;
      max-width: 480px;
      height: 280px;
      perspective: 1000px;
      cursor: pointer;
    }
    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      text-align: center;
      transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      transform-style: preserve-3d;
    }
    .card-inner.flipped {
      transform: rotateY(180deg);
    }
    .card-front, .card-back {
      position: absolute;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.5);
    }
    .card-back {
      transform: rotateY(180deg);
      background: #11141E;
      border-color: #2F354A;
    }
    .badge {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      margin-bottom: 12px;
      font-weight: 600;
    }
    .question {
      font-size: 20px;
      font-weight: 600;
      line-height: 1.4;
    }
    .answer {
      font-size: 17px;
      line-height: 1.6;
      color: #E2E8F0;
    }
    .controls {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      width: 100%;
      max-width: 480px;
    }
    button {
      flex: 1;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    button:hover {
      background: var(--surface-hover);
      border-color: rgba(255,255,255,0.2);
    }
    button.btn-accent {
      background: var(--accent);
      color: #0A0A0C;
      border: none;
    }
    button.btn-accent:hover {
      opacity: 0.9;
    }
    .hint {
      margin-top: 14px;
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="header">
    <span id="card-counter">Card 1 of 3</span>
    <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
    <span id="score-counter">Score: 0</span>
  </div>

  <div class="card-container" onclick="flipCard()">
    <div class="card-inner" id="card">
      <div class="card-front">
        <div class="badge">Question</div>
        <div class="question" id="q-text">What is Quantum Superposition?</div>
      </div>
      <div class="card-back">
        <div class="badge" style="color:#60A5FA;">Answer</div>
        <div class="answer" id="a-text">The ability of a quantum system to exist in multiple states simultaneously until it is measured.</div>
      </div>
    </div>
  </div>
  <div class="hint">Click card or press Space to flip</div>

  <div class="controls">
    <button onclick="recordAnswer(false)">Need Review</button>
    <button class="btn-accent" onclick="recordAnswer(true)">Mastered (+10 XP)</button>
  </div>

  <script>
    const CARDS = [
      { q: "What is Quantum Superposition?", a: "The ability of a quantum system to exist in multiple states simultaneously until measured." },
      { q: "What is Quantum Entanglement?", a: "A phenomenon where quantum particles become inextricably linked regardless of distance." },
      { q: "What is a Qubit?", a: "The basic unit of quantum information, analogous to the classical bit but supporting superposition (alpha|0> + beta|1>)." }
    ];

    let currentIndex = 0;
    let score = 0;

    function updateUI() {
      const card = CARDS[currentIndex];
      document.getElementById('q-text').textContent = card.q;
      document.getElementById('a-text').textContent = card.a;
      document.getElementById('card').classList.remove('flipped');
      document.getElementById('card-counter').textContent = `Card ${currentIndex + 1} of ${CARDS.length}`;
      document.getElementById('progress').style.width = `${((currentIndex + 1) / CARDS.length) * 100}%`;
      document.getElementById('score-counter').textContent = `Score: ${score}`;
    }

    function flipCard() {
      document.getElementById('card').classList.toggle('flipped');
    }

    async function recordAnswer(correct) {
      if (correct) score += 10;
      currentIndex = (currentIndex + 1) % CARDS.length;
      updateUI();
      if (window.polymax?.storage) {
        await window.polymax.storage.set('flashcard_score', score);
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); flipCard(); }
      if (e.code === 'ArrowRight') recordAnswer(true);
      if (e.code === 'ArrowLeft') recordAnswer(false);
    });

    window.addEventListener('load', async () => {
      if (window.polymax?.storage) {
        const saved = await window.polymax.storage.get('flashcard_score');
        if (typeof saved === 'number') score = saved;
      }
      updateUI();
    });
  </script>
</body>
</html>
```

---

## 4. Canonical Example 2: Research Paper Comparison Matrix

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Paper Matrix</title>
  <style>
    :root {
      --bg: #0A0A0C;
      --surface: #131318;
      --accent: #C8FF57;
      --border: #23232E;
      --text: #F0F0F5;
      --muted: #A0A0B0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      min-height: 100vh;
    }
    h2 { font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
    .filters { display: flex; gap: 8px; margin-bottom: 16px; }
    .filter-btn {
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      border-radius: 8px;
      cursor: pointer;
    }
    .filter-btn.active {
      background: rgba(200, 255, 87, 0.12);
      border-color: var(--accent);
      color: var(--accent);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--surface);
    }
    th, td {
      padding: 14px 16px;
      text-align: left;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #17171F;
      color: var(--muted);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    tr:last-child td { border-bottom: none; }
    .tag {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .tag-read { background: rgba(52, 211, 153, 0.15); color: #34D399; }
    .tag-pending { background: rgba(245, 158, 11, 0.15); color: #F59E0B; }
    .btn-link {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--accent);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-link:hover { background: rgba(200, 255, 87, 0.1); }
  </style>
</head>
<body>
  <h2>
    Research Paper Comparator
    <button class="btn-link" onclick="window.polymax?.ui?.expand()">Expand View</button>
  </h2>

  <div class="filters">
    <button class="filter-btn active" onclick="setFilter('all')">All (3)</button>
    <button class="filter-btn" onclick="setFilter('read')">Read (2)</button>
    <button class="filter-btn" onclick="setFilter('pending')">Pending (1)</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>Paper Title</th>
        <th>Algorithm / Mechanism</th>
        <th>Fault Tolerance</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody id="table-body">
      <!-- Populated via script -->
    </tbody>
  </table>

  <script>
    const PAPERS = [
      { id: 'raft', title: 'In Search of an Understandable Consensus Algorithm', algo: 'Leader Election & Log Replication', ft: 'N/2 - 1 nodes', status: 'read', url: 'https://raft.github.io/raft.pdf' },
      { id: 'paxos', title: 'The Part-Time Parliament (Paxos)', algo: 'Synod Protocol / Proposers & Acceptors', ft: 'N/2 - 1 nodes', status: 'read', url: 'https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf' },
      { id: 'pbft', title: 'Practical Byzantine Fault Tolerance (PBFT)', algo: 'Three-Phase Commit (Pre-prepare, Prepare, Commit)', ft: '(N - 1)/3 Byzantine nodes', status: 'pending', url: 'https://pmg.csail.mit.edu/papers/osdi99.pdf' }
    ];

    let currentFilter = 'all';

    function renderTable() {
      const tbody = document.getElementById('table-body');
      tbody.innerHTML = '';
      const list = PAPERS.filter(p => currentFilter === 'all' || p.status === currentFilter);

      list.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600;">${p.title}</td>
          <td style="color:#A0A0B0;">${p.algo}</td>
          <td><code>${p.ft}</code></td>
          <td><span class="tag ${p.status === 'read' ? 'tag-read' : 'tag-pending'}">${p.status.toUpperCase()}</span></td>
          <td><button class="btn-link" onclick="openPaper('${p.url}')">Open Paper</button></td>
        `;
        tbody.appendChild(tr);
      });
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(filter));
      });
      renderTable();
    }

    function openPaper(url) {
      if (window.polymax?.openUrl) {
        window.polymax.openUrl(url);
      } else {
        window.open(url, '_blank');
      }
    }

    renderTable();
  </script>
</body>
</html>
```

---

## 5. Canonical Example 3: Modern TypeScript Feature Module (`feature.ts`)

When creating tools via `create_tab`, you can provide TypeScript code via the `code` parameter.
The runtime saves it to `workspace/<city>/features/<tabId>/feature.ts` and deterministically transpiles it to browser JavaScript.

### Rules for `feature.ts`:
- Single file, clean TypeScript.
- **Forbidden from importing:** Do NOT write `import ...` or `export ...`. The code runs directly inside the sandboxed document.
- Root element `#app` is provided automatically.
- Global `window.polymax` is available immediately with `storage`, `openUrl`, `getContext`, `submit`, and `ui.expand`.

```typescript
// feature.ts - Concept Mastery Matrix & XP Tracker
interface Concept {
  id: string;
  name: string;
  mastery: number; // 0 - 100
  lastReviewed: string;
}

const DEFAULT_CONCEPTS: Concept[] = [
  { id: "qubit", name: "Qubit & Superposition", mastery: 85, lastReviewed: "2026-10-27" },
  { id: "entangle", name: "Quantum Entanglement", mastery: 40, lastReviewed: "2026-10-26" },
  { id: "decohere", name: "Decoherence & Noise", mastery: 20, lastReviewed: "2026-10-25" },
];

async function init() {
  const app = document.getElementById("app");
  if (!app) return;

  // Read saved state via bridge storage
  const saved = await window.polymax.storage.get("concepts");
  const concepts: Concept[] = (saved as Concept[]) || DEFAULT_CONCEPTS;

  function render() {
    app.innerHTML = \`
      <div style="max-width: 600px; margin: 0 auto; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="font-family: var(--font-display); font-size: 18px; color: #F0F0F5;">Mastery Matrix</h2>
          <button id="expand-btn" style="font-size: 11px;">Expand View</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          \${concepts.map(c => \`
            <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 500; font-size: 14px;">\${c.name}</span>
                <span style="color: var(--accent); font-family: var(--font-mono); font-size: 12px;">\${c.mastery}%</span>
              </div>
              <div style="width: 100%; height: 6px; background: #1C1C24; border-radius: 3px; overflow: hidden;">
                <div style="width: \${c.mastery}%; height: 100%; background: var(--accent); transition: width 0.3s ease;"></div>
              </div>
              <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                <button class="drill-btn" data-id="\${c.id}" style="font-size: 11px; padding: 4px 10px;">Practice (+10 XP)</button>
              </div>
            </div>
          \`).join("")}
        </div>
      </div>
    \`;

    document.getElementById("expand-btn")?.addEventListener("click", () => {
      window.polymax.ui.expand();
    });

    document.querySelectorAll(".drill-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        const target = concepts.find(c => c.id === id);
        if (target && target.mastery < 100) {
          target.mastery = Math.min(100, target.mastery + 10);
          await window.polymax.storage.set("concepts", concepts);
          render();
        }
      });
    });
  }

  render();
}

init();
```

---

## 6. Canonical Example 4: Interactive Knowledge Graph & Concept Map

When the user asks for a **concept map**, **knowledge graph**, or **relational diagram of topics** with nodes, links, and real source citations:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --bg: #0A0A0C;
      --surface: #12151D;
      --border: #222938;
      --accent: #C8FF57;
      --text: #F1F3F9;
      --muted: #8B95A8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .header h2 { font-size: 18px; color: var(--accent); }
    .map-container {
      position: relative;
      width: 100%;
      min-height: 480px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    svg.connections {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .node {
      position: absolute;
      background: #161A24;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      width: 200px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .node:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 0 15px rgba(200, 255, 87, 0.2);
    }
    .node-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .node-desc { font-size: 11px; color: var(--muted); line-height: 1.4; margin-bottom: 8px; }
    .source-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-family: monospace;
      color: var(--accent);
      background: rgba(200,255,87,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      text-decoration: none;
    }
    .source-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h2 id="title">Knowledge Map</h2>
    <span style="font-size: 12px; color: var(--muted);">Click nodes to explore primary sources</span>
  </div>

  <div class="map-container" id="container">
    <svg class="connections" id="svg"></svg>
    <div id="nodes"></div>
  </div>

  <script>
    // Concept nodes with real source citations
    const nodes = [
      { id: "root", title: "Dicotomia do Controle", desc: "Coisas sob nosso controle vs fora dele.", x: 50, y: 50, source: "https://en.wikipedia.org/wiki/Epictetus" },
      { id: "virtue", title: "As 4 Virtudes Cardinais", desc: "Sabedoria, Coragem, Justiça, Temperança.", x: 300, y: 180, source: "https://plato.stanford.edu/entries/stoicism/" },
      { id: "nature", title: "Viver Segundo a Natureza", desc: "Conformidade com o Logos e Razão universal.", x: 50, y: 300, source: "https://iep.utm.edu/stoiceth/" }
    ];

    const links = [
      { from: "root", to: "virtue" },
      { from: "virtue", to: "nature" }
    ];

    function render() {
      const container = document.getElementById("nodes");
      const svg = document.getElementById("svg");

      container.innerHTML = nodes.map(n => \`
        <div class="node" id="\${n.id}" style="left: \${n.x}px; top: \${n.y}px;">
          <div class="node-title">\${n.title}</div>
          <div class="node-desc">\${n.desc}</div>
          <a href="#" class="source-link" onclick="openUrl('\${n.source}'); return false;">↗ Fonte Autorizada</a>
        </div>
      \`).join("");

      // Draw SVG lines between connected nodes
      svg.innerHTML = links.map(l => {
        const from = nodes.find(n => n.id === l.from);
        const to = nodes.find(n => n.id === l.to);
        if (!from || !to) return "";
        return \`<line x1="\${from.x + 100}" y1="\${from.y + 35}" x2="\${to.x + 100}" y2="\${to.y + 35}" stroke="rgba(200,255,87,0.3)" stroke-width="2" stroke-dasharray="4" />\`;
      }).join("");
    }

    function openUrl(url) {
      if (window.polymax && window.polymax.openUrl) {
        window.polymax.openUrl(url);
      } else {
        window.open(url, "_blank");
      }
    }

    render();
  </script>
</body>
</html>
```


