import type { Profile } from '../shared/training';

/** One scoped write keeps ordinary preferences and optional meeting details atomic. */
export function settingsStatement(
  env: Env,
  accountId: string,
  settings: Profile,
): D1PreparedStatement {
  const { classSchedule, ...profile } = settings;
  return env.DB.prepare(
    'UPDATE users SET profile_json = ?, class_schedule_json = ? WHERE id = ?',
  ).bind(JSON.stringify(profile), classSchedule ? JSON.stringify(classSchedule) : null, accountId);
}
