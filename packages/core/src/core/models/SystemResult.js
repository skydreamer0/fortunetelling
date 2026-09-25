/**
 * @fileoverview Standard result container produced by every calculation engine.
 *
 * `SystemResult` is the single shared shape that flows through the whole
 * pipeline: engines → LayerClassifier → ScoringRules → RadarBuilder → UI.
 * Every engine returns one of these so downstream code never has to special-case
 * a particular system.
 *
 * The `components` array is the contract consumed by {@link LayerClassifier}:
 * each component carries `{ id, name, category, value }`, where `category` is the
 * key the classifier maps to an L0–L3 layer.
 *
 * @module core/models/SystemResult
 */

// ─── Type Definitions ───────────────────────────────────────────────────────

/**
 * A single atomic piece of output from an engine (a star placement, a life-path
 * number, a trigram, etc.). This is the unit LayerClassifier and ScoringRules
 * operate on.
 *
 * @typedef {Object} Component
 * @property {string} id            - Unique-within-engine identifier
 * @property {string} name          - Human-readable display name (Chinese)
 * @property {string} category      - Classification key (maps to a layer rule)
 * @property {*} value              - The payload (any shape the engine needs)
 * @property {Object} [meta]        - Optional extra metadata for the UI
 */

/**
 * @typedef {Object} SystemResultParams
 * @property {string} engineId       - Stable engine id (e.g. "ziwei")
 * @property {string} engineName     - Display name (e.g. "紫微斗數")
 * @property {Component[]} [components] - Atomic outputs
 * @property {Object} [meta]         - Engine-level metadata (chart summary, etc.)
 * @property {string[]} [errors]     - Non-fatal warnings/errors gathered while computing
 * @property {number} [durationMs]   - Compute time in milliseconds
 */

/**
 * Standard, engine-agnostic result container.
 *
 * Construct directly, or build incrementally with {@link SystemResult#add}.
 */
export class SystemResult {
  /** @type {string} Stable engine id (matches BaseEngine.id) */
  engineId;
  /** @type {string} Display name */
  engineName;
  /** @type {Component[]} Atomic outputs consumed downstream */
  components;
  /** @type {Object} Engine-level metadata */
  meta;
  /** @type {string[]} Non-fatal warnings collected during compute */
  errors;
  /** @type {number} Compute time in milliseconds (set by BaseEngine) */
  durationMs;
  /** @type {string} ISO timestamp of when the result was produced */
  computedAt;

  /**
   * @param {SystemResultParams} params
   */
  constructor({ engineId, engineName, components = [], meta = {}, errors = [], durationMs = 0 }) {
    if (!engineId) throw new Error('SystemResult requires an engineId.');
    this.engineId = engineId;
    this.engineName = engineName ?? engineId;
    this.components = [];
    this.meta = meta;
    this.errors = [...errors];
    this.durationMs = durationMs;
    this.computedAt = new Date().toISOString();

    // Normalize any components passed at construction time.
    for (const c of components) this.add(c);
  }

  /**
   * Append a component, normalizing it to the standard shape. Chainable.
   *
   * @param {Partial<Component> & { category: string }} component
   * @returns {this}
   */
  add(component) {
    this.components.push(SystemResult.component(component));
    return this;
  }

  /**
   * Append many components at once. Chainable.
   *
   * @param {Array<Partial<Component> & { category: string }>} components
   * @returns {this}
   */
  addMany(components) {
    for (const c of components) this.add(c);
    return this;
  }

  /**
   * Record a non-fatal warning without aborting the computation. Chainable.
   *
   * @param {string} message
   * @returns {this}
   */
  warn(message) {
    this.errors.push(message);
    return this;
  }

  /**
   * Get all components in a given category.
   *
   * @param {string} category
   * @returns {Component[]}
   */
  byCategory(category) {
    return this.components.filter(c => c.category === category);
  }

  /**
   * Whether the result carries any usable output.
   *
   * @returns {boolean}
   */
  get isEmpty() {
    return this.components.length === 0;
  }

  /**
   * Factory that normalizes a loose object into a valid {@link Component}.
   * Every engine should build components through here (or via {@link add}) so
   * the shape stays consistent across systems.
   *
   * @param {Partial<Component> & { category: string }} raw
   * @returns {Component}
   */
  static component(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Component must be an object.');
    }
    if (!raw.category) {
      throw new Error('Component requires a "category" (used for layer classification).');
    }
    const category = raw.category;
    return {
      id: raw.id ?? category,
      name: raw.name ?? category,
      category,
      value: raw.value ?? null,
      ...(raw.meta ? { meta: raw.meta } : {}),
    };
  }

  /**
   * Plain-object snapshot for serialization / debugging.
   *
   * @returns {SystemResultParams & { computedAt: string }}
   */
  toJSON() {
    return {
      engineId: this.engineId,
      engineName: this.engineName,
      components: this.components,
      meta: this.meta,
      errors: this.errors,
      durationMs: this.durationMs,
      computedAt: this.computedAt,
    };
  }
}
