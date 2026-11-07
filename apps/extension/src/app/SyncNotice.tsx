/**
 * Sidebar notice shown while auto-sync is paused on a conflict: which files
 * changed on both sides and how to continue.
 */
import type { SyncView } from "./syncStore";

/**
 * Render the paused-sync notice, or nothing while sync runs normally.
 */
export function SyncNotice({ sync, onSyncNow }: { sync: SyncView; onSyncNow: () => void }) {
  if (!sync.stopped || sync.result === null) return null;
  const { files, message } = sync.result;
  return (
    <div className="sync-notice" role="alert">
      <p>
        <strong>Sync is paused.</strong>{" "}
        {message ??
          "Your notes and the remote changed the same lines. Your version stays on this computer, and nothing was overwritten."}
      </p>
      {files.length > 0 && (
        <ul aria-label="Changed on both sides">
          {files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      )}
      <p>Combine the changes with Git in the notes folder, then select Sync now.</p>
      <button type="button" className="sidebar__action" onClick={onSyncNow}>
        Sync now
      </button>
    </div>
  );
}
