import type { DevUiTarget } from "../api";

export function AgentPicker({
  targets,
  selected,
  onSelect,
}: {
  targets: DevUiTarget[];
  selected: DevUiTarget | null;
  onSelect(target: DevUiTarget): void;
}) {
  return (
    <section>
      <div className="sectionHeader">
        <h2>Targets</h2>
      </div>
      <div className="targetList">
        {targets.map((target) => (
          <button
            key={`${target.type}:${target.name}`}
            type="button"
            className={selected?.name === target.name && selected.type === target.type ? "selected" : ""}
            onClick={() => onSelect(target)}
          >
            <span>{target.name}</span>
            <small>{target.type}{target.mode ? ` / ${target.mode}` : ""}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
