import type {
  AdvisorReportDefinition,
  validateAdvisorReportAnswers,
} from '../shared/report-definition';

/** Grouped field controls; the owning draft alone decides persistence and protected edits. */
export default function AdvisorReportAnswers({
  definition,
  answers,
  editedKeys,
  errors,
  onEdit,
  onSuggestion,
}: {
  definition: AdvisorReportDefinition;
  answers: Record<string, string>;
  editedKeys: string[];
  errors: ReturnType<typeof validateAdvisorReportAnswers>;
  onEdit: (key: string, value: string) => void;
  onSuggestion: (key: string) => void;
}) {
  return (
    <div className="advisor-answers">
      {[...new Set(definition.fields.map((field) => field.section))].map((section) => (
        <fieldset key={section}>
          <legend>{section}</legend>
          {definition.fields
            .filter((field) => field.section === section)
            .map((field) => {
              const id = `advisor-answer-${field.key}`;
              const problem = errors.find((error) => error.key === field.key);
              const input = {
                id,
                value: answers[field.key] ?? '',
                'aria-invalid': Boolean(problem),
                'aria-describedby': problem ? `${id}-error` : undefined,
                onChange: (
                  event: React.ChangeEvent<
                    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                  >,
                ) => onEdit(field.key, event.target.value),
              };
              return (
                <div key={field.key}>
                  <label htmlFor={id}>
                    {field.section} — {field.label}
                    {field.required ? ' (required)' : ' (optional)'}
                  </label>
                  {field.type === 'rating' ? (
                    <select {...input}>
                      <option value="">No answer</option>
                      {field.options?.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea {...input} maxLength={4000} rows={3} />
                  ) : (
                    <input
                      {...input}
                      type={field.type === 'date' ? 'date' : 'text'}
                      inputMode={field.type === 'number' ? 'decimal' : undefined}
                      maxLength={4000}
                    />
                  )}
                  {problem && (
                    <p id={`${id}-error`} role="alert">
                      {problem.message}
                    </p>
                  )}
                  {editedKeys.includes(field.key) && (
                    <button
                      className="button outline small"
                      onClick={() => onSuggestion(field.key)}
                    >
                      Use suggestion for {field.label}
                    </button>
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}
    </div>
  );
}
