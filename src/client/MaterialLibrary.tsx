import { useState } from 'react';
import {
  MATERIAL_USAGES,
  MAX_MATERIAL_FILE_BYTES,
  decodeMaterialFile,
  originalMaterialCopy,
  validateInstructorMaterial,
  type InstructorMaterial,
  type OriginalMaterialInventory,
  type MaterialUsage,
} from '../shared/instructor-material';
import type { AccountChange } from '../shared/account-sync';
import type { PracticeSession, Profile } from '../shared/training';
import type { PracticeLaunch } from './practice-launch';
import MaterialReader from './MaterialReader';
import Modal from './Modal';
import './materials.css';
interface Props {
  scope: string;
  profile: Profile;
  materials: InstructorMaterial[];
  original?: OriginalMaterialInventory;
  onChange: (change: AccountChange) => Promise<unknown>;
  onPractice: (launch: Omit<PracticeLaunch, 'id'>) => Promise<unknown>;
}
export default function MaterialLibrary({
  scope,
  profile,
  materials,
  original,
  onChange,
  onPractice,
}: Props) {
  const [reader, setReader] = useState<InstructorMaterial>();
  const [editor, setEditor] = useState<{
    material?: InstructorMaterial;
    original?: Record<string, unknown>;
  }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState('all');
  const revisions = new Set(materials.map((material) => material.supersedesId).filter(Boolean));
  async function start(material: InstructorMaterial, context: PracticeSession['context']) {
    setError('');
    try {
      const result = await onPractice({
        material,
        materialContext: context,
        activity: { type: 'timer' },
        tool: 'sending',
      });
      if (result !== false) setReader(undefined);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <section className="card material-library" aria-label="Instructor materials">
      <div className="section-heading">
        <div>
          <h2>Instructor materials</h2>
          <p>Private text, links and revisions for your course sessions.</p>
        </div>
        <button className="button" disabled={!profile.firstClassDate} onClick={() => setEditor({})}>
          Add material
        </button>
      </div>
      {!profile.firstClassDate && (
        <p>Save your course dates in Settings before associating materials.</p>
      )}
      <label className="field">
        Material session
        <select value={session} onChange={(event) => setSession(event.target.value)}>
          <option value="all">All sessions and versions</option>
          {Array.from({ length: 16 }, (_, index) => (
            <option key={index} value={index + 1}>
              Session {index + 1}
            </option>
          ))}
        </select>
      </label>
      {!materials.length && !original?.materials.length && (
        <p>No instructor materials yet. Add your advisor’s text or a safe link.</p>
      )}
      <ul className="material-list">
        {materials
          .filter((material) => session === 'all' || material.session === Number(session))
          .map((material) => (
            <li key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <p>
                  Session {material.session} · {material.course.level} · course starts{' '}
                  {material.course.firstClassDate} · {MATERIAL_USAGES[material.usage]}
                  {revisions.has(material.id) ? ' · earlier version' : ''}
                </p>
              </div>
              <div className="material-actions">
                <button className="button outline" onClick={() => setReader(material)}>
                  Read {material.title}
                </button>
                <button className="text-button" onClick={() => setEditor({ material })}>
                  Revise {material.title}
                </button>
              </div>
            </li>
          ))}
      </ul>
      {original && original.materials.length > 0 && (
        <details>
          <summary>Imported original materials ({original.materials.length})</summary>
          <p>
            The original archive stays intact. Associate a validated copy with a known
            course/session to read and use it here. Original IDs and revision lineage stay with the
            copy.
          </p>
          <ul className="material-list">
            {original.materials.map((source) => (
              <li key={String(source.id)}>
                <div>
                  <strong>{String(source.title ?? source.id)}</strong>
                  <p>
                    Original ID {String(source.id)} · original session{' '}
                    {String(source.session ?? 'unmatched')}
                    {source.supersedesId ? ` · revises ${String(source.supersedesId)}` : ''}
                  </p>
                </div>
                <button
                  className="button outline"
                  disabled={!profile.firstClassDate}
                  onClick={() => setEditor({ original: source })}
                >
                  Associate {String(source.title ?? source.id)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {reader && (
        <Modal title="Read instructor material" wide onClose={() => setReader(undefined)}>
          <MaterialReader key={reader.id} material={reader} scope={scope} />
          <div className="material-actions">
            <button className="button" onClick={() => void start(reader, 'practice')}>
              Use for practice
            </button>
            <button className="button outline" onClick={() => void start(reader, 'class')}>
              Use in class
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <MaterialEditor
          profile={profile}
          initial={editor.material}
          source={editor.original}
          archive={original}
          onClose={() => setEditor(undefined)}
          onSave={async (material) => {
            const receipt = await onChange({ type: 'material-create', material });
            setNotice(
              receipt &&
                typeof receipt === 'object' &&
                'destination' in receipt &&
                receipt.destination === 'server'
                ? 'Material saved to your private account.'
                : 'Material retained on this device; account upload is pending. Your practice results wait for this material to save.',
            );
            setEditor(undefined);
            setReader(material);
          }}
        />
      )}
    </section>
  );
}
function MaterialEditor({
  profile,
  initial,
  source,
  archive,
  onClose,
  onSave,
}: {
  profile: Profile;
  initial?: InstructorMaterial;
  source?: Record<string, unknown>;
  archive?: OriginalMaterialInventory;
  onClose: () => void;
  onSave: (material: InstructorMaterial) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? String(source?.title ?? ''),
    text: initial?.text ?? String(source?.text ?? ''),
    url: initial?.url ?? String(source?.url ?? ''),
    session: String(
      initial?.session ??
        (Number.isInteger(source?.session) &&
        Number(source?.session) >= 1 &&
        Number(source?.session) <= 16
          ? source?.session
          : source
            ? ''
            : 1),
    ),
    usage: (initial?.usage ?? source?.usage ?? 'preparation') as MaterialUsage,
    filename: initial?.filename ?? String(source?.filename ?? ''),
  });
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const identity = useState(() => ({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }))[0];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const course = initial?.course ?? {
        level: profile.level,
        firstClassDate: profile.firstClassDate,
      };
      const material =
        source && archive
          ? originalMaterialCopy(
              source,
              archive.archiveId,
              course,
              Number(form.session),
              identity.createdAt,
            )
          : validateInstructorMaterial({
              version: 1,
              ...identity,
              course,
              session: Number(form.session),
              title: form.title,
              text: form.text,
              usage: form.usage,
              ...(form.url ? { url: form.url } : {}),
              ...(form.filename ? { filename: form.filename } : {}),
              ...(initial ? { supersedesId: initial.id } : {}),
            });
      await onSave({ ...material, ...identity });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        source
          ? 'Associate original material'
          : initial
            ? 'Create material revision'
            : 'Add instructor material'
      }
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="material-editor" onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy || reading}>
          <p>
            Associated course: {initial?.course.level ?? profile.level}; starts{' '}
            {initial?.course.firstClassDate ?? profile.firstClassDate}.
          </p>
          {source && (
            <p>
              Original source: {String(archive?.course.title ?? 'Imported course')}; session{' '}
              {String(source.session ?? 'unmatched')}. Choose its known Academy session below.
            </p>
          )}
          <p>
            {initial
              ? 'A new immutable version retains the original and its previous attempts.'
              : source
                ? 'Choose the matching session explicitly. Original text, link, filename and usage are copied unchanged.'
                : 'Paste private plain text, add a safe link or choose a UTF-8 text file (up to 100,000 bytes).'}
          </p>
          <label className="field">
            Title
            <input
              value={form.title}
              readOnly={!!source}
              maxLength={200}
              required
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label className="field">
            Session
            <select
              value={form.session}
              required
              disabled={!!initial}
              onChange={(event) => setForm({ ...form, session: event.target.value })}
            >
              <option value="">Choose session</option>
              {Array.from({ length: 16 }, (_, index) => (
                <option key={index} value={index + 1}>
                  Session {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Usage
            <select
              value={form.usage}
              disabled={!!source}
              onChange={(event) => setForm({ ...form, usage: event.target.value as MaterialUsage })}
            >
              {Object.entries(MATERIAL_USAGES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Material text
            <textarea
              rows={8}
              value={form.text}
              readOnly={!!source}
              maxLength={100000}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
            />
          </label>
          <label className="field">
            Material link
            <input
              type="url"
              value={form.url}
              readOnly={!!source}
              maxLength={2000}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </label>
          {!source && (
            <label className="field">
              UTF-8 text file
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setReading(true);
                  try {
                    if (file.size > MAX_MATERIAL_FILE_BYTES)
                      throw new Error('Choose a text file of at most 100,000 bytes.');
                    const text = decodeMaterialFile(new Uint8Array(await file.arrayBuffer()));
                    setForm((previous) => ({ ...previous, text, filename: file.name }));
                    setError('');
                  } catch (failure) {
                    setError((failure as Error).message);
                  } finally {
                    event.target.value = '';
                    setReading(false);
                  }
                }}
              />
            </label>
          )}
          {form.filename && <p>Source filename: {form.filename}</p>}
        </fieldset>
        {error && (
          <p className="alert error" role="alert">
            {error} Your fields remain available for retry.
          </p>
        )}
        <div className="material-actions">
          <button className="button" disabled={busy || reading}>
            {busy
              ? 'Saving material…'
              : source
                ? 'Save associated copy'
                : initial
                  ? 'Save revision'
                  : 'Save material'}
          </button>
          <button className="button outline" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
