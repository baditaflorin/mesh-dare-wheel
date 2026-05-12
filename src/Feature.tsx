import { useEffect, useRef, useState } from "react";
import {
  combineSalts,
  commit,
  randomSalt,
  verifyReveal,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Phase = "idle" | "commit" | "reveal" | "done";
type Player = { id: string; name: string };

const NAME_KEY = (prefix: string) => `${prefix}:displayName`;

const SEED_DARES = [
  "do 10 push-ups",
  "sing one verse of your favorite song",
  "tell your most embarrassing story",
  "do your best impression of the host",
  "let someone send a text from your phone",
  "wear something on your head for the next round",
  "buy the next round of drinks",
];

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="dw-screen">
        <h1>dare wheel</h1>
        <p className="dw-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [draft, setDraft] = useState("");
  const [, rerender] = useState(0);
  const [result, setResult] = useState<{ idx: number; option: string } | null>(null);
  const saltRef = useRef("");

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const yPlayers = room.doc.getMap<Player>("players");
    const yOptions = room.doc.getArray<string>("options");
    const yCommits = room.doc.getMap<{ hash: string }>("commits");
    const yReveals = room.doc.getMap<{ salt: string }>("reveals");
    const yPhase = room.doc.getMap<{ phase: Phase }>("phase");

    // Seeds are rendered as a base layer (see `displayed` below) rather than
    // pushed into Yjs, so two peers racing on mount can never double-seed.
    // User-added dares live in yOptions; the spin RNG operates on the merged
    // list, which every peer computes identically.

    const onChange = () => rerender((n) => n + 1);
    yPlayers.observe(onChange);
    yOptions.observe(onChange);
    yCommits.observe(onChange);
    yReveals.observe(onChange);
    yPhase.observe(onChange);
    return () => {
      yPlayers.unobserve(onChange);
      yOptions.unobserve(onChange);
      yCommits.unobserve(onChange);
      yReveals.unobserve(onChange);
      yPhase.unobserve(onChange);
    };
  }, [room]);

  useEffect(() => {
    const myName = name.trim() || `peer-${room.peerId.slice(0, 4)}`;
    room.doc.getMap<Player>("players").set(room.peerId, { id: room.peerId, name: myName });
  }, [room, name]);

  const yPlayers = room.doc.getMap<Player>("players");
  const yOptions = room.doc.getArray<string>("options");
  const yCommits = room.doc.getMap<{ hash: string }>("commits");
  const yReveals = room.doc.getMap<{ salt: string }>("reveals");
  const yPhase = room.doc.getMap<{ phase: Phase }>("phase");
  const phase: Phase = yPhase.get("current")?.phase ?? "idle";

  const players: Player[] = [];
  yPlayers.forEach((p) => players.push(p));
  players.sort((a, b) => a.id.localeCompare(b.id));
  const userAdded = yOptions.toArray();
  // Every peer renders the same merged list (no race-prone Yjs seeding).
  const options = [...SEED_DARES, ...userAdded];

  useEffect(() => {
    if (phase !== "commit") return;
    if (yCommits.has(room.peerId)) return;
    const salt = randomSalt();
    saltRef.current = salt;
    void commit("", salt).then(({ hash }) => yCommits.set(room.peerId, { hash }));
  }, [phase, room.peerId, yCommits]);

  useEffect(() => {
    if (phase !== "reveal") return;
    if (yReveals.has(room.peerId)) return;
    if (!saltRef.current) return;
    yReveals.set(room.peerId, { salt: saltRef.current });
  }, [phase, room.peerId, yReveals]);

  useEffect(() => {
    if (phase !== "reveal" && phase !== "done") return;
    if (players.length === 0 || options.length === 0) return;
    if (!players.every((p) => yReveals.has(p.id))) return;
    if (!players.every((p) => yCommits.has(p.id))) return;
    void (async () => {
      for (const p of players) {
        const c = yCommits.get(p.id)?.hash ?? "";
        const r = yReveals.get(p.id)?.salt ?? "";
        if (!(await verifyReveal(c, { salt: r, payload: "" }))) {
          console.error(`[dare-wheel] bad commit from ${p.id}`);
          return;
        }
      }
      const salts = players.map((p) => yReveals.get(p.id)!.salt);
      const seed = combineSalts(salts);
      const idx = Math.floor(seed * options.length) % options.length;
      const option = options[idx] ?? "";
      setResult({ idx, option });
      if (phase === "reveal") yPhase.set("current", { phase: "done" });
    })();
  }, [phase, players.length, options.length]);

  const addOption = () => {
    const t = draft.trim();
    if (!t) return;
    yOptions.push([t]);
    setDraft("");
  };
  const removeOption = (i: number) => yOptions.delete(i, 1);

  const spin = () => {
    if (players.length < 1 || options.length < 2) return;
    room.doc.transact(() => {
      yCommits.clear();
      yReveals.clear();
      yPhase.set("current", { phase: "commit" });
    });
    setResult(null);
  };

  const allCommitted = players.length > 0 && players.every((p) => yCommits.has(p.id));
  const advance = () => yPhase.set("current", { phase: "reveal" });

  const reset = () => {
    room.doc.transact(() => {
      yCommits.clear();
      yReveals.clear();
      yPhase.set("current", { phase: "idle" });
    });
    setResult(null);
    saltRef.current = "";
  };

  return (
    <div className="dw-screen">
      <header className="dw-header">
        <h1>dare wheel</h1>
        <input
          className="dw-name"
          placeholder="your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
        />
        <p className="dw-status">
          {players.length} player{players.length === 1 ? "" : "s"} · {options.length} option
          {options.length === 1 ? "" : "s"}
        </p>
      </header>

      {phase === "idle" && (
        <>
          <ul className="dw-options">
            {options.map((opt, i) => {
              const isSeed = i < SEED_DARES.length;
              const userIdx = i - SEED_DARES.length;
              return (
                <li key={`${i}-${opt}`}>
                  <span>
                    {opt}
                    {isSeed && <span className="dw-seed-tag"> default</span>}
                  </span>
                  {!isSeed && (
                    <button type="button" onClick={() => removeOption(userIdx)}>
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <form
            className="dw-add"
            onSubmit={(e) => {
              e.preventDefault();
              addOption();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add a dare…"
              maxLength={80}
            />
            <button type="submit">add</button>
          </form>
          <button type="button" className="dw-spin" disabled={options.length < 2} onClick={spin}>
            🎯 SPIN THE WHEEL
          </button>
        </>
      )}

      {phase === "commit" && (
        <div className="dw-card">
          <p>committing entropy…</p>
          <p className="dw-help">
            {yCommits.size}/{players.length} sealed
          </p>
          <button type="button" disabled={!allCommitted} onClick={advance}>
            all sealed → reveal
          </button>
        </div>
      )}

      {phase === "reveal" && (
        <div className="dw-card">
          <p>revealing…</p>
          <p className="dw-help">
            {yReveals.size}/{players.length} revealed
          </p>
        </div>
      )}

      {phase === "done" && result && (
        <div className="dw-card dw-result">
          <p className="dw-result-tag">the wheel says</p>
          <p className="dw-result-big">{result.option}</p>
          <p className="dw-help">
            picked deterministically from {options.length} options · seed combined from{" "}
            {players.length} player salts
          </p>
          <button type="button" onClick={reset}>
            new spin
          </button>
        </div>
      )}
    </div>
  );
}
