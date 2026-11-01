-- Increase the Free plan My Pages allowance to five.
-- Existing user_limit_overrides remain untouched.
UPDATE plans
SET limits_json = json_set(COALESCE(limits_json, '{}'), '$.pages', 5)
WHERE lower(id) = 'free';
