import { useRef, useState } from 'react';
import { Download, FileJson, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Display';
import { Select, Switch } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { downloadText } from '@/features/bookmarks/bookmarkIO';
import { planImport, type ImportPlan, type ImportStrategy } from '@/features/backup/importPlanner';
import { usePreferences } from '@/hooks/useData';
import { applyImport, exportAll, fetchAll } from '@/repositories/backup';
import { parseBackup, MAX_BACKUP_BYTES, type BackupFile } from '@/schemas/backup';
import { COLLECTIONS } from '@/types/models';
import { friendlyDataError } from '@/lib/firebase/errors';
import { todayStr } from '@/utils/dates';

const STRATEGIES: { value: ImportStrategy; label: string }[] = [
  { value: 'skip', label: 'Skip items that already exist (safest)' },
  { value: 'newer', label: 'Replace existing items if the backup is newer' },
  { value: 'overwrite', label: 'Replace existing items with the backup' },
  { value: 'duplicate', label: 'Keep both (import conflicts as copies)' },
];

export function BackupSection() {
  const { db, uid } = useSession();
  const { prefs } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>('skip');
  const [restorePrefs, setRestorePrefs] = useState(false);
  const [pending, setPending] = useState<{ backup: BackupFile; plan: ImportPlan } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const backup = await exportAll(db, uid, prefs, __APP_VERSION__);
      const count = COLLECTIONS.reduce((n, c) => n + backup.data[c].length, 0);
      downloadText(`personal-hub-backup-${todayStr()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      toast.success(`Exported ${count} items from Firestore`);
    } catch (e) {
      toast.error(`Export failed: ${friendlyDataError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error('Backup file is larger than 50 MB.');
      return;
    }
    if (!navigator.onLine) {
      toast.warning('Connect to the internet to restore a backup.');
      return;
    }
    setBusy('import');
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        toast.error(`Invalid backup: ${parsed.errors.slice(0, 3).join('; ')}`);
        return;
      }
      const existingLists = await Promise.all(COLLECTIONS.map((c) => fetchAll(db, uid, c)));
      const existing = Object.fromEntries(COLLECTIONS.map((c, i) => [c, existingLists[i]])) as unknown as Parameters<typeof planImport>[1];
      setPending({ backup: parsed.backup, plan: planImport(parsed.backup, existing, strategy) });
    } catch (e) {
      toast.error(`Could not read backup: ${friendlyDataError(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!pending) return;
    const { plan, backup } = pending;
    const replaces = COLLECTIONS.reduce((n, c) => n + plan.summary[c].replace, 0);
    if (replaces > 0) {
      const ok = await confirm({
        title: 'Replace existing items?',
        message: `${replaces} existing items will be overwritten with the versions from the backup. This cannot be undone.`,
        confirmLabel: 'Replace and import',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy('import');
    try {
      const n = await applyImport(db, uid, plan, restorePrefs ? backup.preferences : undefined, (done, total) => setProgress(`${done} / ${total}`));
      toast.success(`Restore complete: ${n} items written.`);
      setPending(null);
    } catch (e) {
      toast.error(`Restore stopped: ${friendlyDataError(e)}. Items already written were kept; you can run the import again with "Skip".`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Backup & restore" icon={<FileJson className="h-4 w-4" />} />
      <div className="space-y-5 px-5 pb-5 text-sm">
        <p className="text-slate-600 dark:text-slate-400">
          Download a complete JSON copy of your data (no passwords or sign-in tokens are included). Free cloud services and browser storage do not
          guarantee permanent retention — keep regular backups somewhere you control.
        </p>
        <Button icon={<Download className="h-4 w-4" />} loading={busy === 'export'} disabled={busy !== null} onClick={() => void doExport()}>
          Export everything
        </Button>

        <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h3 className="font-medium">Restore from a backup</h3>
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-500">When an item already exists</span>
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as ImportStrategy)} disabled={pending !== null}>
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <Switch checked={restorePrefs} onChange={setRestorePrefs} label="Also restore settings" description="Theme, dashboard widgets and notification preferences." />
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          {!pending && (
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} loading={busy === 'import'} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              Choose backup file…
            </Button>
          )}
        </div>

        {pending && (
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700" role="region" aria-label="Import preview">
            <p className="font-medium">Import preview</p>
            <p className="mt-0.5 text-xs text-slate-500">Backup from {new Date(pending.backup.exportedAt).toLocaleString()}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Type</th>
                    <th className="py-1 pr-3 font-medium">New</th>
                    <th className="py-1 pr-3 font-medium">Replace</th>
                    <th className="py-1 pr-3 font-medium">Skipped (same ID)</th>
                    <th className="py-1 font-medium">Skipped (duplicate)</th>
                  </tr>
                </thead>
                <tbody>
                  {COLLECTIONS.map((c) => (
                    <tr key={c} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-3 capitalize">{c}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{pending.plan.summary[c].create}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{pending.plan.summary[c].replace}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{pending.plan.summary[c].skippedSameId}</td>
                      <td className="py-1.5 tabular-nums">{pending.plan.summary[c].skippedDuplicate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button loading={busy === 'import'} disabled={pending.plan.ops.length === 0 && !restorePrefs} onClick={() => void runImport()}>
                Import {pending.plan.ops.length} items
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setPending(null)}>
                Cancel
              </Button>
              {progress && <span className="text-xs text-slate-500">Writing {progress}…</span>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
