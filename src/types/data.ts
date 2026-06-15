// Persisted Carrel data (saveData/loadData). Nooks + the global category list
// live here. The shapes fill in over the nook (Phase 5) and category (Phase 6)
// phases; Phase 0 ships the envelope.

export interface CarrelData {
  schemaVersion: number;
  nooks: unknown[];
  categories: unknown[];
}

export const CARREL_SCHEMA_VERSION = 1;

export const DEFAULT_DATA: CarrelData = {
  schemaVersion: CARREL_SCHEMA_VERSION,
  nooks: [],
  categories: [],
};
