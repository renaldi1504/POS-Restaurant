-- Permission baru "reports.owner" (Laporan owner) untuk role Owner bawaan yang sudah ada.
UPDATE "roles"
SET "permissions" = "permissions" || '["reports.owner"]'::jsonb
WHERE "system" = true AND "name" = 'Owner' AND NOT ("permissions" ? 'reports.owner');
