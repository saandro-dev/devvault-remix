INSERT INTO vault_module_dependencies (module_id, depends_on_id, dependency_type)
VALUES ('19f2c74a-4612-471c-b26d-4ec2bd329628', '987a4b58-fcc1-4980-8ce3-d0aa841ef971', 'required')
ON CONFLICT (module_id, depends_on_id) DO NOTHING;