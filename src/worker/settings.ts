import type { Profile } from '../shared/training';

/** One scoped write keeps ordinary preferences, meeting details and report rules atomic. */
export function settingsStatement(
  env: Env,
  accountId: string,
  settings: Profile,
): D1PreparedStatement {
  const { classSchedule, reportDefinition, ...profile } = settings;
  return env.DB.prepare(
    'UPDATE users SET profile_json = ?, class_schedule_json = ?, report_definition_json = ? WHERE id = ?',
  ).bind(
    JSON.stringify(profile),
    classSchedule ? JSON.stringify(classSchedule) : null,
    reportDefinition ? JSON.stringify(reportDefinition) : null,
    accountId,
  );
}
