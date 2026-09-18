-- Monotonic counter for DisplayControlResponse.version.
-- Replaces the previous wall-clock version (DisplayControlState.updatedAt), which
-- could go backwards across function instances with skewed clocks and cause
-- clients to permanently discard newer state. It also never moved at all when a
-- group or item changed, so uploads and deletes carried a stale version.
CREATE SEQUENCE IF NOT EXISTS "control_state_version" AS BIGINT START WITH 1 INCREMENT BY 1 CACHE 1;
