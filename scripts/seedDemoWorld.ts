import { writeCityFile } from "../server/workspace/cityWorkspace";
import { writeFeature } from "../server/workspace/features";
import { db } from "../server/workspace/db";

interface SeedCityConfig {
  id: string;
  title: string;
  region: string;
  level: number;
  tags: string[];
  overview: string;
  sources: Array<{ title: string; url: string; kind: "paper" | "article" | "video" | "course"; why: string; level: "beginner" | "intermediate" | "advanced" }>;
  quests: Array<{ id: string; tier: "novice" | "practitioner" | "master"; title: string; description: string; tasks: string[]; sourceUrl?: string }>;
  feature: {
    tabId: string;
    title: string;
    icon: string;
    code: string;
  };
}

const DEMO_CITIES: SeedCityConfig[] = [
  // 1. Artificial Intelligence
  {
    id: "neural-networks",
    title: "Neural Networks",
    region: "Artificial Intelligence",
    level: 1,
    tags: ["deep-learning", "backpropagation", "mathematics"],
    overview: `# Neural Networks: Foundations of Deep Learning

Neural networks are parameterized non-linear function approximators optimized via gradient descent and backpropagation.

## Key Theoretical Invariants
- **Universal Approximation Theorem:** A feedforward network with a single hidden layer and non-linear activation can approximate any continuous function on compact subsets of $\\mathbb{R}^n$.
- **Chain Rule & Backpropagation:** Efficient recursive gradient evaluation through reverse-mode automatic differentiation.
`,
    sources: [
      {
        title: "Deep Learning (Nature, 2015)",
        url: "https://www.nature.com/articles/nature14539",
        kind: "paper",
        why: "Seminal review by Yann LeCun, Yoshua Bengio, and Geoffrey Hinton on representation learning.",
        level: "intermediate",
      },
      {
        title: "Neural Networks & Backpropagation (3Blue1Brown)",
        url: "https://www.3blue1brown.com/topics/neural-networks",
        kind: "video",
        why: "Visual and geometric intuition of linear algebra transformations in high-dimensional weight spaces.",
        level: "beginner",
      },
    ],
    quests: [
      {
        id: "quest-nn-novice",
        tier: "novice",
        title: "Perceptron & Non-Linearity",
        description: "Derive why a single linear layer cannot solve XOR and examine how ReLU solves gradient vanishing.",
        tasks: [
          "Prove non-separability of XOR in 2D linear boundary",
          "Inspect derivative of sigmoid vs ReLU at large activations",
          "Implement forward pass in workspace scratchpad",
        ],
        sourceUrl: "https://www.nature.com/articles/nature14539",
      },
      {
        id: "quest-nn-practitioner",
        tier: "practitioner",
        title: "Backpropagation Graph Derivation",
        description: "Manually compute reverse-mode autodiff gradients for a 2-layer MLP with cross-entropy loss.",
        tasks: [
          "Write partial derivatives dL/dW2 and dL/dW1",
          "Verify gradient shapes match weight matrix dimensions",
        ],
        sourceUrl: "https://www.3blue1brown.com/topics/neural-networks",
      },
      {
        id: "quest-nn-master",
        tier: "master",
        title: "Loss Landscape Optimization",
        description: "Analyze saddle points, conditioning of the Hessian, and adaptive learning rate schedulers.",
        tasks: [
          "Examine spectral radius of weight updates",
          "Synthesize empirical stability heuristics in production training",
        ],
      },
    ],
    feature: {
      tabId: "activation-lab",
      title: "Activation Lab",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">Activation Lab</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Interactive non-linear activation explorer.</p>
      <input type="range" id="slider" min="-4" max="4" step="0.1" value="0.5" style="width: 100%; margin-bottom: 16px;" />
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--muted);">INPUT X</div>
          <div id="val-x" style="font-size: 20px; font-weight: bold;">0.50</div>
        </div>
        <div style="padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--muted);">RELU(X)</div>
          <div id="val-relu" style="font-size: 20px; font-weight: bold; color: var(--accent);">0.50</div>
        </div>
      </div>
    </div>
  \`;
  const slider = document.getElementById("slider") as HTMLInputElement;
  const valX = document.getElementById("val-x");
  const valRelu = document.getElementById("val-relu");
  slider?.addEventListener("input", (e: any) => {
    const v = parseFloat(e.target.value);
    if (valX) valX.textContent = v.toFixed(2);
    if (valRelu) valRelu.textContent = Math.max(0, v).toFixed(2);
  });
}
      `,
    },
  },
  {
    id: "transformers",
    title: "Transformers",
    region: "Artificial Intelligence",
    level: 3,
    tags: ["attention", "llm", "deep-learning"],
    overview: `# Transformers: Self-Attention & Sequence Modeling

The Transformer eliminates recurrence and convolutions, relying entirely on multi-head scaled dot-product attention to model global dependencies.

## Key Formulation
$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$
`,
    sources: [
      {
        title: "Attention Is All You Need (Vaswani et al., 2017)",
        url: "https://arxiv.org/abs/1706.03762",
        kind: "paper",
        why: "The foundational paper introducing the Transformer architecture and multi-head self-attention.",
        level: "intermediate",
      },
      {
        title: "The Illustrated Transformer (Jay Alammar)",
        url: "https://jalammar.github.io/illustrated-transformer/",
        kind: "article",
        why: "Visual breakdown of encoder-decoder stacks, residual connections, and positional encodings.",
        level: "beginner",
      },
    ],
    quests: [
      {
        id: "quest-tf-novice",
        tier: "novice",
        title: "Scaled Dot-Product Attention",
        description: "Deconstruct the role of Query, Key, and Value vectors and the $\\sqrt{d_k}$ scaling factor.",
        tasks: [
          "Explain why unscaled dot products cause softmax saturation for large dimensions",
          "Map tensor dimensions across projection matrices",
        ],
        sourceUrl: "https://arxiv.org/abs/1706.03762",
      },
      {
        id: "quest-tf-practitioner",
        tier: "practitioner",
        title: "Rotary & Positional Encodings",
        description: "Analyze how non-recurrent models inject sequence order using sinusoidal vs RoPE encodings.",
        tasks: ["Compare relative position decay in RoPE", "Verify causal masking logic"],
      },
      {
        id: "quest-tf-master",
        tier: "master",
        title: "Attention Complexity & FlashAttention",
        description: "Evaluate IO-aware tiling algorithms optimizing memory bandwidth on modern GPUs.",
        tasks: ["Derive SRAM block partitioning for online softmax"],
      },
    ],
    feature: {
      tabId: "attention-head",
      title: "Attention Matrix Inspector",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  const tokens = ["The", "agent", "synthesizes", "knowledge"];
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">Attention Matrix Inspector</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Inspect query-key alignment weights.</p>
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        \${tokens.map((tok, i) => \`<button class="tok-btn" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: \${i === 1 ? 'var(--accent-dim)' : 'transparent'}; cursor: pointer;">\${tok}</button>\`).join("")}
      </div>
      <div style="font-size: 13px; color: var(--text);">Token [agent] contextual attention: 0.88 to [synthesizes].</div>
    </div>
  \`;
}
      `,
    },
  },

  // 2. Philosophy & Mind
  {
    id: "stoicism",
    title: "Stoicism",
    region: "Philosophy & Mind",
    level: 1,
    tags: ["ethics", "epictetus", "virtue"],
    overview: `# Stoicism: Reason, Virtue, and the Dichotomy of Control

Stoicism is a Hellenistic school of philosophy founded in Athens by Zeno of Citium.

## Core Principle: The Dichotomy of Control
"Some things are in our control and others not. Things in our control are opinion, pursuit, desire, aversion, and, in a word, whatever are our own actions. Things not in our control are body, property, reputation, command, and, in one word, whatever are not our own actions." — Epictetus, Enchiridion
`,
    sources: [
      {
        title: "Meditations (Marcus Aurelius)",
        url: "https://en.wikipedia.org/wiki/Meditations",
        kind: "paper",
        why: "Personal spiritual exercises of Roman Emperor Marcus Aurelius on duty, nature, and tranquility.",
        level: "beginner",
      },
      {
        title: "Stanford Encyclopedia of Philosophy: Stoicism",
        url: "https://plato.stanford.edu/entries/stoicism/",
        kind: "article",
        why: "Authoritative academic overview of Stoic logic, physics, and ethics.",
        level: "intermediate",
      },
    ],
    quests: [
      {
        id: "quest-st-novice",
        tier: "novice",
        title: "The Discipline of Assent",
        description: "Distinguish between raw impressions (phantasiai) and value judgments.",
        tasks: [
          "Identify an external frustration and strip evaluative adjectives",
          "Apply Epictetus' test of control",
        ],
        sourceUrl: "https://en.wikipedia.org/wiki/Meditations",
      },
      {
        id: "quest-st-practitioner",
        tier: "practitioner",
        title: "Amor Fati & Memento Mori",
        description: "Analyze the physics of deterministic causal networks and psychological resilience.",
        tasks: ["Reflect on cosmological interconnectedness (sympatheia)"],
      },
      {
        id: "quest-st-master",
        tier: "master",
        title: "The Sage & Virtue as the Sole Good",
        description: "Contrast Stoic eudaimonia with Aristotelian and Epicurean teleology.",
        tasks: ["Evaluate internal moral consistency against external fortune"],
      },
    ],
    feature: {
      tabId: "control-dichotomy",
      title: "Control Filter",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">Control Filter</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Dichotomy of Control by Epictetus.</p>
      <button id="toggle-sphere" style="margin-bottom: 16px; background: var(--accent); color: #000; font-weight: bold; border-radius: 6px; border: none; padding: 8px 16px; cursor: pointer;">Toggle Sphere</button>
      <div id="content" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; color: var(--text);">
        In Your Power: Intentions, desires, judgments, actions.
      </div>
    </div>
  \`;
  let inside = true;
  document.getElementById("toggle-sphere")?.addEventListener("click", () => {
    inside = !inside;
    const el = document.getElementById("content");
    if (el) el.textContent = inside ? "In Your Power: Intentions, desires, judgments, actions." : "Outside Your Power: External opinions, outcomes, the past and future.";
  });
}
      `,
    },
  },
  {
    id: "consciousness",
    title: "Consciousness",
    region: "Philosophy & Mind",
    level: 4,
    tags: ["hard-problem", "qualia", "philosophy-of-mind"],
    overview: `# Consciousness: The Hard Problem & Subjective Experience

Why should physical information processing feel like anything from the inside?

## Key Formulations
- **The Hard Problem (David Chalmers):** Explaining how and why physical matter gives rise to subjective phenomenological experience.
- **Qualia (Thomas Nagel):** What it is like for an organism to have subjective inner life.
`,
    sources: [
      {
        title: "Facing Up to the Problem of Consciousness (Chalmers, 1995)",
        url: "https://consc.net/papers/facing.html",
        kind: "paper",
        why: "Seminal formulation distinguishing easy functional problems from the hard phenomenological problem.",
        level: "intermediate",
      },
      {
        title: "What Is It Like to Be a Bat? (Nagel, 1974)",
        url: "https://www.sas.upenn.edu/~cavitch/pdf-library/Nagel_Bat.pdf",
        kind: "paper",
        why: "Classic argument showing objective third-person accounts cannot exhaust first-person point of view.",
        level: "beginner",
      },
    ],
    quests: [
      {
        id: "quest-con-novice",
        tier: "novice",
        title: "Easy Problems vs The Hard Problem",
        description: "Differentiate cognitive functional mechanisms (reaction, reportability) from phenomenological experience.",
        tasks: ["Read Chalmers section 2 and list 4 easy problems", "Formulate the explanatory gap"],
        sourceUrl: "https://consc.net/papers/facing.html",
      },
      {
        id: "quest-con-practitioner",
        tier: "practitioner",
        title: "Mary's Room & The Knowledge Argument",
        description: "Examine Frank Jackson's thought experiment on physicalism and epiphenomenalism.",
        tasks: ["Analyze whether Mary learns something new upon seeing red"],
      },
      {
        id: "quest-con-master",
        tier: "master",
        title: "Integrated Information Theory (IIT)",
        description: "Evaluate mathematical measures of irreducible causal structure (Phi).",
        tasks: ["Critique substrate independence vs functionalism"],
      },
    ],
    feature: {
      tabId: "qualia-gauge",
      title: "Explanatory Gap Gauge",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">The Explanatory Gap</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Third-person cognitive functions vs First-person qualia.</p>
      <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; font-family: var(--font-mono); color: var(--accent);">
        Subjective Feel ≠ Computational Flux
      </div>
    </div>
  \`;
}
      `,
    },
  },

  // 3. Quantum Mechanics
  {
    id: "superposition",
    title: "Superposition",
    region: "Quantum Mechanics",
    level: 2,
    tags: ["hilbert-space", "qubits", "linear-algebra"],
    overview: `# Quantum Superposition: Linear State Spaces & Measurement

In quantum mechanics, a physical system can exist simultaneously in a linear combination of mutually orthogonal eigenstates until measurement.

## Mathematical Representation
$$|\\psi\\rangle = \\alpha |0\\rangle + \\beta |1\\rangle, \\quad |\\alpha|^2 + |\\beta|^2 = 1$$
`,
    sources: [
      {
        title: "The Principles of Quantum Mechanics (P.A.M. Dirac)",
        url: "https://en.wikipedia.org/wiki/The_Principles_of_Quantum_Mechanics",
        kind: "paper",
        why: "Dirac's canonical textbook introducing bra-ket notation and transformation theory.",
        level: "advanced",
      },
      {
        title: "Quantum Computation and Quantum Information (Nielsen & Chuang)",
        url: "https://en.wikipedia.org/wiki/Quantum_Computation_and_Quantum_Information",
        kind: "course",
        why: "The standard reference on qubits, Bloch sphere representation, and unitary gates.",
        level: "intermediate",
      },
    ],
    quests: [
      {
        id: "quest-sup-novice",
        tier: "novice",
        title: "The Bloch Sphere & State Vectors",
        description: "Represent a pure qubit state as coordinates on the surface of the Bloch sphere.",
        tasks: [
          "Derive probability of measuring state 0 from amplitude alpha",
          "Map Hadamard gate transformation to rotation on the Bloch sphere",
        ],
      },
      {
        id: "quest-sup-practitioner",
        tier: "practitioner",
        title: "Double-Slit & Wave-Particle Duality",
        description: "Calculate interference fringes and de Broglie wavelengths for massive particles.",
        tasks: ["Demonstrate how measurement collapses which-way information"],
      },
      {
        id: "quest-sup-master",
        tier: "master",
        title: "Decoherence & The Density Matrix",
        description: "Model environmental entangling interactions transitioning pure states into mixed states.",
        tasks: ["Compute trace distance and purity of open quantum systems"],
      },
    ],
    feature: {
      tabId: "bloch-sphere",
      title: "Bloch Sphere State",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">Bloch Polar Angle θ</h2>
      <input type="range" id="theta-slider" min="0" max="180" value="45" style="width: 100%; margin-bottom: 16px;" />
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div style="padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--muted);">PROB |0⟩</div>
          <div id="p0" style="font-size: 20px; font-weight: bold; color: var(--accent);">85.4%</div>
        </div>
        <div style="padding: 12px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--muted);">PROB |1⟩</div>
          <div id="p1" style="font-size: 20px; font-weight: bold;">14.6%</div>
        </div>
      </div>
    </div>
  \`;
  const slider = document.getElementById("theta-slider") as HTMLInputElement;
  slider?.addEventListener("input", (e: any) => {
    const deg = parseFloat(e.target.value);
    const rad = (deg * Math.PI) / 180;
    const p0Val = Math.cos(rad / 2) ** 2;
    const p1Val = Math.sin(rad / 2) ** 2;
    const p0El = document.getElementById("p0");
    const p1El = document.getElementById("p1");
    if (p0El) p0El.textContent = (p0Val * 100).toFixed(1) + "%";
    if (p1El) p1El.textContent = (p1Val * 100).toFixed(1) + "%";
  });
}
      `,
    },
  },
  {
    id: "entanglement",
    title: "Entanglement",
    region: "Quantum Mechanics",
    level: 5,
    tags: ["bell-inequality", "epr", "non-locality"],
    overview: `# Quantum Entanglement & Non-Locality

Entangled composite states cannot be factored into product states of individual subsystems:
$$|\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)$$

## The EPR Paradox & Bell's Theorem
Local realism demands that physical systems possess definite values independent of measurement and that signals cannot propagate faster than light. Bell proved that quantum mechanical correlations violate any local hidden-variable theory.
`,
    sources: [
      {
        title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete? (EPR, 1935)",
        url: "https://journals.aps.org/pr/abstract/10.1103/PhysRev.47.777",
        kind: "paper",
        why: "Einstein, Podolsky, and Rosen's foundational critique challenging standard Copenhagen interpretation.",
        level: "advanced",
      },
      {
        title: "On the Einstein Podolsky Rosen Paradox (J.S. Bell, 1964)",
        url: "https://en.wikipedia.org/wiki/Bell%27s_theorem",
        kind: "paper",
        why: "Bell's inequality mathematically separating local hidden variables from quantum non-locality.",
        level: "advanced",
      },
    ],
    quests: [
      {
        id: "quest-ent-novice",
        tier: "novice",
        title: "The Bell States",
        description: "Write out the 4 maximally entangled 2-qubit Bell states and verify non-separability.",
        tasks: ["Demonstrate that |Phi+> cannot be written as |a> ⊗ |b>"],
      },
      {
        id: "quest-ent-practitioner",
        tier: "practitioner",
        title: "CHSH Inequality Violation",
        description: "Derive the classical correlation bound |S| <= 2 vs Tsirelson's quantum bound 2*sqrt(2).",
        tasks: ["Examine experimental loophole-free Bell tests (Aspect, Zeilinger)"],
      },
      {
        id: "quest-ent-master",
        tier: "master",
        title: "Quantum Teleportation & No-Cloning Theorem",
        description: "Trace state transfer protocol using pre-shared entanglement and classical communication.",
        tasks: ["Prove that an unknown quantum state cannot be cloned without destruction"],
      },
    ],
    feature: {
      tabId: "bell-analyzer",
      title: "CHSH Correlation Monitor",
      icon: "Sparkles",
      code: `
const app = document.getElementById("app");
if (app) {
  app.innerHTML = \`
    <div style="padding: 24px;">
      <h2 style="font-size: 18px; color: var(--accent); margin-bottom: 8px;">CHSH Inequality Test</h2>
      <div style="margin-top: 16px; padding: 16px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent-dim);">
        <div style="font-size: 11px; color: var(--muted);">EXPERIMENTAL VALUE S</div>
        <div style="font-size: 24px; font-weight: bold; color: var(--accent);">2.828 (2√2)</div>
        <p style="font-size: 12px; color: var(--muted); margin-top: 8px;">Classical Local Bound: ≤ 2.0. Quantum Mechanics violates local realism.</p>
      </div>
    </div>
  \`;
}
      `,
    },
  },
];

export async function seedDemoWorld() {
  console.log(`[Seed] Seeding demo world with 3 regions and 6 deeply researched cities...`);

  for (const city of DEMO_CITIES) {
    console.log(`[Seed] Constructing city workspace: ${city.id} (${city.title})...`);

    // 1. Insert into SQLite cities table
    db.query(
      `INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(city.id, city.title, city.region, city.level, JSON.stringify(city.tags), Math.floor(Date.now() / 1000));

    // 2. Write notes/overview.md
    await writeCityFile(city.id, "notes/overview.md", city.overview);

    // 3. Write feed.json
    const feedJson = {
      cityId: city.id,
      updatedAt: new Date().toISOString(),
      items: city.sources.map((s) => ({
        title: s.title,
        url: s.url,
        kind: s.kind,
        summary: s.why,
        tags: city.tags,
      })),
    };
    await writeCityFile(city.id, "feed.json", JSON.stringify(feedJson, null, 2));

    // 4. Write quests/tree.json
    await writeCityFile(city.id, "quests/tree.json", JSON.stringify(city.quests, null, 2));

    // 5. Write feature module micro-app
    await writeFeature(city.id, city.feature.tabId, {
      manifest: {
        id: city.feature.tabId,
        title: city.feature.title,
        icon: city.feature.icon,
        scope: "city",
        version: 1,
      },
      code: city.feature.code,
    });
  }

  console.log(`[Seed] Successfully seeded ${DEMO_CITIES.length} cities with verified sources and micro-apps.`);
}

if (import.meta.main) {
  await seedDemoWorld();
  process.exit(0);
}
