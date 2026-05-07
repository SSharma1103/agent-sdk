import type { DevUiRunResponse } from "../api";

export function RunDetails({ run }: { run: DevUiRunResponse | null }) {
  if (!run) return <div className="empty">No run selected.</div>;
  return (
    <div className="runDetails">
      <dl>
        <div>
          <dt>Run ID</dt>
          <dd>{run.runId}</dd>
        </div>
        <div>
          <dt>Total Tokens</dt>
          <dd>{run.output.usage?.totalTokens ?? 0}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{run.events.length}</dd>
        </div>
      </dl>
      <pre>{JSON.stringify(run.output, null, 2)}</pre>
    </div>
  );
}
