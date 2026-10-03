import {
  requireOriginalMaterialCopies,
  sameMaterialValue,
  validateInstructorMaterials,
  type InstructorMaterial,
  type OriginalMaterialInventory,
} from '../shared/instructor-material';
import { HttpError } from './http';

export function materialInsertStatement(
  env: Env,
  accountId: string,
  material: InstructorMaterial,
): D1PreparedStatement {
  return env.DB.prepare(
    'INSERT INTO instructor_materials(user_id,id,material_json) VALUES(?,?,?) ON CONFLICT(user_id,id) DO NOTHING',
  ).bind(accountId, material.id, JSON.stringify(material));
}
export function mergeInstructorMaterials(
  existing: readonly InstructorMaterial[],
  incoming: readonly InstructorMaterial[],
): InstructorMaterial[] {
  const merged = new Map(existing.map((material) => [material.id, material]));
  for (const material of incoming) {
    const prior = merged.get(material.id);
    if (prior && !sameMaterialValue(prior, material))
      throw new HttpError(
        400,
        'A material ID has different immutable content. Keep both backups and create an explicit revision.',
      );
    merged.set(material.id, material);
  }
  try {
    return validateInstructorMaterials([...merged.values()]);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}
export function requireOwnedOriginalMaterials(
  materials: readonly InstructorMaterial[],
  inventory?: OriginalMaterialInventory,
): void {
  try {
    requireOriginalMaterialCopies(materials, inventory);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}
