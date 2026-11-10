import {useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Kbd} from '@astryxdesign/core/Kbd';
import {createHistory, displayText, hexColor, segments} from './history';

const SAMPLES = [
  {label: '#E8683A', text: '#E8683A', hint: 'a color'},
  {label: 'npm run build && npm test', text: 'npm run build && npm test', hint: 'a command'},
  {label: 'Sent from the 14:05 to Nakuru', text: 'Sent from the 14:05 to Nakuru', hint: 'a sentence'},
  {label: 'Blackie Labs⏎Ngong Road⏎Nairobi', text: 'Blackie Labs\nNgong Road\nNairobi', hint: 'three lines'},
];

const short = (text: string) => {
  const shown = displayText(text);
  return shown.length > 30 ? `${shown.slice(0, 29)}…` : shown;
};

/** A working copy of the Tokly history popup. Everything stays in this component's memory. */
export function Demo() {
  const history = useMemo(() => createHistory(), []);
  const [, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const bump = () => setVersion((version) => version + 1);

  const rows = history.list(query);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const activeId = selected ? selected.id : null;

  const choose = (id: string | null) => {
    const item = history.get(id);
    if (!item) return;
    history.add(item.text);
    setSelectedId(item.id);
    setQuery('');
    setStatus(`Copied “${short(item.text)}” inside the demo. Your real clipboard was not touched.`);
    bump();
  };

  const togglePin = () => {
    if (!selected) return;
    const letter = history.togglePin(selected.id);
    setSelectedId(selected.id);
    setStatus(letter ? `Pinned as ${letter.toUpperCase()}. Pins stay at the top and are never pushed out.` : 'Unpinned.');
    bump();
  };

  const removeSelected = () => {
    if (!selected) return;
    const index = rows.findIndex((row) => row.id === selected.id);
    const neighbour = rows[index + 1] ?? rows[index - 1] ?? null;
    history.remove(selected.id);
    setSelectedId(neighbour ? neighbour.id : null);
    setStatus(`Deleted “${short(selected.text)}” from the demo history.`);
    bump();
  };

  const move = (step: number) => {
    if (!rows.length) return;
    const index = rows.findIndex((row) => row.id === activeId);
    setSelectedId(rows[Math.min(rows.length - 1, Math.max(0, index + step))].id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Enter') choose(activeId);
    else if (event.altKey && event.code === 'KeyP') togglePin();
    else if (event.altKey && event.key === 'Backspace') removeSelected();
    else if (event.key === 'Escape' && query) setQuery('');
    else return;
    event.preventDefault();
  };

  const addSample = (text: string) => {
    setSelectedId(history.add(text));
    setQuery('');
    setStatus(`Added “${short(text)}” to the demo history. Now search for it.`);
    bump();
    searchRef.current?.focus({preventScroll: true});
  };

  const reset = () => {
    history.reset();
    setSelectedId(null);
    setQuery('');
    setStatus('Demo history reset.');
    bump();
  };

  let unpinnedSeen = 0;
  const firstUnpinned = rows.findIndex((row) => row.pin === null);

  return (
    <VStack gap={4}>
      <figure className="stage" aria-label="Interactive demo of the Tokly history">
        <span className="slip slip-a" aria-hidden="true">#E8683A</span>
        <span className="slip slip-b" aria-hidden="true">git stash pop</span>
        <span className="slip slip-c" aria-hidden="true">Screenshot 16.20</span>

        <section className="popup">
          <input
            ref={searchRef}
            className="popup-search"
            type="text"
            value={query}
            placeholder="type to search…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="demo-list"
            aria-autocomplete="list"
            aria-activedescendant={activeId ? `opt-${activeId}` : undefined}
            aria-label="Search the demo clipboard history"
            aria-describedby="demo-help"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {rows.length > 0 ? (
            <ul id="demo-list" className="popup-list" role="listbox" aria-label="Demo clipboard history">
              {rows.map((row, index) => {
                const color = hexColor(row.text);
                const hint = row.pin ? row.pin.toUpperCase() : ++unpinnedSeen <= 9 ? String(unpinnedSeen) : '';
                return (
                  <li
                    key={row.id}
                    id={`opt-${row.id}`}
                    role="option"
                    aria-selected={row.id === activeId}
                    className={[
                      row.id === activeId ? 'is-selected' : '',
                      row.pin ? 'is-pinned' : '',
                      index === firstUnpinned && index > 0 ? 'starts-unpinned' : '',
                    ].join(' ')}
                    onClick={() => choose(row.id)}
                  >
                    {color ? <span className="swatch" style={{background: color}} /> : null}
                    <span className="popup-title">
                      {segments(displayText(row.text), query.trim()).map((part, at) =>
                        part.match ? <strong key={at}>{part.text}</strong> : <span key={at}>{part.text}</span>,
                      )}
                    </span>
                    {hint ? <span className="popup-hint">{hint}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p id="demo-list" className="popup-empty">
              {query ? 'No matches' : 'Nothing copied yet. Copy something and it will show up here.'}
            </p>
          )}
          <footer className="popup-footer" aria-hidden="true">
            <span>↑↓ move</span>
            <span>↩ copy</span>
            <span>⌥P pin</span>
            <span>⌥⌫ delete</span>
          </footer>
        </section>
      </figure>

      <HStack gap={2} wrap="wrap" vAlign="center">
        <Button label={selected?.pin ? 'Unpin' : 'Pin'} size="sm" isDisabled={!selected} onClick={togglePin} />
        <Button label="Delete" size="sm" isDisabled={!selected} onClick={removeSelected} />
        <Button label="Reset" size="sm" variant="ghost" onClick={reset} />
        <Text type="supporting">
          or <Kbd keys="alt+p" /> and <Kbd keys="alt+backspace" /> in the search field
        </Text>
      </HStack>

      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Copy one of these, then find it in the history
        </Text>
        <ul className="samples">
          {SAMPLES.map((sample) => (
            <li key={sample.text}>
              <code>{sample.label}</code>
              <Button label={`Copy ${sample.hint}`} size="sm" onClick={() => addSample(sample.text)} />
            </li>
          ))}
        </ul>
      </VStack>

      <Text type="supporting" id="demo-help">
        Interactive demo. It lives on this page only and never reads your clipboard.
      </Text>
      <p className="demo-status" role="status" aria-live="polite">
        {status}
      </p>
    </VStack>
  );
}
