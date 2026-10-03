-- Private immutable versions; current course settings never rewrite past material facts.
CREATE TABLE instructor_materials (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 material_json TEXT NOT NULL CHECK(json_valid(material_json) AND length(CAST(material_json AS BLOB))<=420000),
 PRIMARY KEY(user_id,id)
);
CREATE TRIGGER instructor_materials_limit BEFORE INSERT ON instructor_materials
WHEN NOT EXISTS(SELECT 1 FROM instructor_materials WHERE user_id=NEW.user_id AND id=NEW.id)
 AND (SELECT count(*) FROM instructor_materials WHERE user_id=NEW.user_id)>=200
BEGIN SELECT RAISE(ABORT,'material_version_limit'); END;
CREATE TRIGGER instructor_materials_immutable BEFORE UPDATE OF material_json ON instructor_materials
WHEN OLD.material_json<>NEW.material_json
BEGIN SELECT RAISE(ABORT,'material_version_immutable'); END;
CREATE TRIGGER instructor_materials_storage_limit BEFORE INSERT ON instructor_materials
WHEN NOT EXISTS(SELECT 1 FROM instructor_materials WHERE user_id=NEW.user_id AND id=NEW.id)
 AND (SELECT storage_bytes-lifecycle_control_bytes FROM users WHERE id=NEW.user_id)+length(CAST(NEW.material_json AS BLOB))>6291456
BEGIN SELECT RAISE(ABORT,'account_storage_limit'); END;
CREATE TRIGGER instructor_materials_storage_insert AFTER INSERT ON instructor_materials
BEGIN UPDATE users SET storage_bytes=storage_bytes+length(CAST(NEW.material_json AS BLOB)), history_revision=history_revision+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER instructor_materials_storage_delete AFTER DELETE ON instructor_materials
BEGIN UPDATE users SET storage_bytes=storage_bytes-length(CAST(OLD.material_json AS BLOB)), history_revision=history_revision+1 WHERE id=OLD.user_id; END;
-- Portable imports put parents first. Recheck owned parent relationships at the actual write.
CREATE TRIGGER instructor_materials_parent BEFORE INSERT ON instructor_materials
WHEN json_extract(NEW.material_json,'$.supersedesId') IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM instructor_materials AS parent WHERE parent.user_id=NEW.user_id AND parent.id=json_extract(NEW.material_json,'$.supersedesId')
 AND json_extract(parent.material_json,'$.session')=json_extract(NEW.material_json,'$.session')
 AND json_extract(parent.material_json,'$.course.level')=json_extract(NEW.material_json,'$.course.level')
 AND json_extract(parent.material_json,'$.course.firstClassDate')=json_extract(NEW.material_json,'$.course.firstClassDate')
 AND json_extract(parent.material_json,'$.createdAt')<=json_extract(NEW.material_json,'$.createdAt'))
BEGIN SELECT RAISE(ABORT,'material_parent_missing'); END;
-- A client-supplied version header never grants access to another user's material.
CREATE TRIGGER practice_entries_material_insert BEFORE INSERT ON practice_entries
WHEN json_extract(NEW.entry_json,'$.metadata.instructorMaterial.id') IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM instructor_materials AS material WHERE material.user_id=NEW.user_id AND material.id=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.id')
 AND json_extract(material.material_json,'$.session')=json_extract(NEW.entry_json,'$.lesson')
 AND json_extract(material.material_json,'$.title')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.title')
 AND json_extract(material.material_json,'$.course.level')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.course.level')
 AND json_extract(material.material_json,'$.course.firstClassDate')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.course.firstClassDate'))
BEGIN SELECT RAISE(ABORT,'material_reference_missing'); END;
CREATE TRIGGER practice_entries_material_update BEFORE UPDATE OF entry_json ON practice_entries
WHEN json_extract(NEW.entry_json,'$.metadata.instructorMaterial.id') IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM instructor_materials AS material WHERE material.user_id=NEW.user_id AND material.id=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.id')
 AND json_extract(material.material_json,'$.session')=json_extract(NEW.entry_json,'$.lesson')
 AND json_extract(material.material_json,'$.title')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.title')
 AND json_extract(material.material_json,'$.course.level')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.course.level')
 AND json_extract(material.material_json,'$.course.firstClassDate')=json_extract(NEW.entry_json,'$.metadata.instructorMaterial.course.firstClassDate'))
BEGIN SELECT RAISE(ABORT,'material_reference_missing'); END;
