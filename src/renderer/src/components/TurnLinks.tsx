export interface TurnDestination {
  id: string
  label: string
  path: string
}

export function TurnLinks({ label, choices, empty, busy, onOpen }: {
  label: string
  choices: TurnDestination[]
  empty: string
  busy: boolean
  onOpen(id: string): void
}) {
  if (!choices.length) return empty ? <p className="turn-link-status">{empty}</p> : null
  const [first] = choices
  return (
    <div className="turn-links">
      {choices.length === 1 ? (
        <button className="quiet turn-link" type="button" title={first.path} disabled={busy} onClick={() => onOpen(first.id)}>
          {label}
        </button>
      ) : (
        <details>
          <summary>{label} <span>{choices.length}개</span></summary>
          <ul>
            {choices.map((choice) => (
              <li key={choice.id}>
                <button className="quiet turn-link" type="button" title={choice.path} disabled={busy} onClick={() => onOpen(choice.id)}>
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
