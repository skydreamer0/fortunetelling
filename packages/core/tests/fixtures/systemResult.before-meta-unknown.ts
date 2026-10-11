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
 */
export interface Component {
  /** Unique-within-engine identifier */
  id: string;
  /** Human-readable display name (Chinese) */
  name: string;
  /** Classification key (maps to a layer rule) */
  category: string;
  /** The payload (any shape the engine needs) */
  value: any;
  /** Optional extra metadata for the UI */
  meta?: any;
}

/** Loose component input accepted by {@link SystemResult.component}: only `category` is required. */
export type ComponentInput = Partial<Component> & { category: string };

/** Engine-level metadata (chart summary, conventions, unavailable reasons, …). */
export type SystemResultMeta = Record<string, any>;

export interface SystemResultParams {
  /** Stable engine id (e.g. "ziwei") */
  engineId: string;
  /** Display name (e.g. "紫微斗數") */
  engineName?: string;
  /** Atomic outputs */
  components?: ComponentInput[];
  /** Engine-level metadata (chart summary, etc.) */
  meta?: SystemResultMeta;
  /** Non-fatal warnings/errors gathered while computing */
  errors?: string[];
  /** Compute time in milliseconds */
  durationMs?: number;
}

/**
 * Structural view of a {@link SystemResult} or its serialized JSON — the
 * analysis builders are tolerant and accept either.
 */
export interface SystemResultLike {
  engineId: string;
  engineName?: string;
  components?: Component[];
  meta?: SystemResultMeta;
  errors?: string[];
}

/** Plain-object snapshot produced by {@link SystemResult#toJSON}. */
export interface SystemResultJSON {
  engineId: string;
  engineName: string;
  components: Component[];
  meta: SystemResultMeta;
  errors: string[];
  durationMs: number;
  computedAt: string;
}

/**
 * Standard, engine-agnostic result container.
 *
 * Construct directly, or build incrementally with {@link SystemResult#add}.
 */
export class SystemResult {
  /** Stable engine id (matches BaseEngine.id) */
  engineId: string;
  /** Display name */
  engineName: string;
  /** Atomic outputs consumed downstream */
  components: Component[];
  /** Engine-level metadata */
  meta: SystemResultMeta;
  /** Non-fatal warnings collected during compute */
  errors: string[];
  /** Compute time in milliseconds (set by BaseEngine) */
  durationMs: number;
  /** ISO timestamp of when the result was produced */
  computedAt: string;

  constructor({ engineId, engineName, components = [], meta = {}, errors = [], durationMs = 0 }: SystemResultParams) {
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
   */
  add(component: ComponentInput): this {
    this.components.push(SystemResult.component(component));
    return this;
  }

  /**
   * Append many components at once. Chainable.
   */
  addMany(components: ComponentInput[]): this {
    for (const c of components) this.add(c);
    return this;
  }

  /**
   * Record a non-fatal warning without aborting the computation. Chainable.
   */
  warn(message: string): this {
    this.errors.push(message);
    return this;
  }

  /**
   * Get all components in a given category.
   */
  byCategory(category: string): Component[] {
    return this.components.filter(c => c.category === category);
  }

  /**
   * Whether the result carries any usable output.
   */
  get isEmpty(): boolean {
    return this.components.length === 0;
  }

  /**
   * Factory that normalizes a loose object into a valid {@link Component}.
   * Every engine should build components through here (or via {@link add}) so
   * the shape stays consistent across systems.
   */
  static component(raw: ComponentInput): Component {
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
   */
  toJSON(): SystemResultJSON {
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
