-- Editable manufacturer-backed model profiles.
--
-- Suggestions remain derived from the currently accepted manufacturer's
-- product text. This table stores only the owner's overrides, including an
-- explicit JSON null when the owner intentionally clears a suggestion.
-- source_mfr_product_id binds those overrides to the mapping that was visible
-- while they were edited; the API ignores stale overrides after a remap.
CREATE TABLE IF NOT EXISTS mfr_profile (
  master_model_id       INTEGER NOT NULL REFERENCES master_model(id) ON DELETE CASCADE,
  source_mfr_product_id INTEGER NOT NULL REFERENCES mfr_product(id),
  overrides_json        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides_json)),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  updated_by            TEXT,
  PRIMARY KEY (master_model_id, source_mfr_product_id)
);

CREATE INDEX IF NOT EXISTS idx_mfr_profile_source
  ON mfr_profile(source_mfr_product_id);
