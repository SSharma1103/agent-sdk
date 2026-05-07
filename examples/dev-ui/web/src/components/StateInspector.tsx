import { FormEvent } from "react";
import type { DevUiSession } from "../api";

export function StateInspector({
  session,
  onSubmit,
}: {
  session: DevUiSession;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <form className="stateEditor" onSubmit={onSubmit}>
      <textarea name="state" defaultValue={JSON.stringify(session.state, null, 2)} />
      <button type="submit">Save State</button>
    </form>
  );
}
