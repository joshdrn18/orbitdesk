UPDATE plans SET limits_json = json_set(COALESCE(limits_json, '{}'), '$.workspaces', 1) WHERE lower(id) = 'free';
UPDATE plans SET limits_json = json_set(COALESCE(limits_json, '{}'), '$.workspaces', 2) WHERE lower(id) = 'premium';
UPDATE plans SET limits_json = json_set(COALESCE(limits_json, '{}'), '$.workspaces', 5) WHERE lower(id) = 'business';

INSERT INTO workspaces (id, owner_user_id, name, slug, created_at)
SELECT lower(hex(randomblob(16))), u.id, u.display_name || ' Workspace', 'ws-' || lower(hex(randomblob(6))), unixepoch() * 1000
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id);

INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
SELECT w.id, w.owner_user_id, 'owner', w.created_at
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members wm
  WHERE wm.workspace_id = w.id AND wm.user_id = w.owner_user_id
);

UPDATE user_limit_overrides
SET limits_json = json_set(COALESCE(limits_json, '{}'), '$.workspaces', -1),
    updated_at = unixepoch() * 1000
WHERE user_id IN (SELECT user_id FROM master_admins);
