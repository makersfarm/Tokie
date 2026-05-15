import { useEffect, useState } from 'react';
import type { PetSnapshot } from '@core/types';
import { STAGES, nextThreshold } from '@core/pet/stages';

// Inlined to avoid pulling better-sqlite3 into the renderer bundle.
interface TokenSum { input: number; output: number; cacheRead: number; cacheCreate: number }
interface SourceBreakdown extends TokenSum { source: string; events: number }
interface EventStats {
  events: number;
  totalCostUsd: number;
  firstTs: number | null;
  lastTs:  number | null;
  lifetime: TokenSum;
  last24h:  TokenSum;
  last7d:   TokenSum;
  bySource: SourceBreakdown[];
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function tokenTotal(t: TokenSum): number {
  return t.input + t.output + t.cacheRead + t.cacheCreate;
}

export function StatsView() {
  const [snap, setSnap] = useState<PetSnapshot | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);

  const reload = () => {
    window.pet.getSnapshot().then(setSnap);
    window.pet.getStats().then(setStats);
  };

  useEffect(() => {
    reload();
    return window.pet.subscribe(() => reload());
  }, []);

  if (!snap || !stats) return <div className="stats loading">Loading...</div>;

  const stageName = STAGES.find(s => s.phase === snap.phase)?.name ?? '?';
  const next = nextThreshold(snap.phase);
  const pct  = next ? Math.min(100, (snap.lifetimeXP / next) * 100) : 100;
  const createdAgo = ((Date.now() - snap.createdAt) / (24 * 60 * 60 * 1000)).toFixed(1);

  return (
    <div className="stats">
      <h1>Token Eater Pet</h1>

      <section>
        <h2>Pet</h2>
        <table>
          <tbody>
            <tr><th>Stage</th><td>{stageName} (phase {snap.phase})</td></tr>
            <tr><th>XP</th>
                <td>{fmtNum(Math.floor(snap.lifetimeXP))}
                    {next ? ` / ${fmtNum(next)} (${pct.toFixed(1)}%)` : ' (max)'}</td></tr>
            <tr><th>Condition</th><td>{snap.condition.toFixed(0)} / 100 ({snap.mood})</td></tr>
            <tr><th>Created</th><td>{fmtTime(snap.createdAt)} ({createdAgo}d ago)</td></tr>
            <tr><th>Last fed</th><td>{fmtTime(snap.lastFedAt)}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Lifetime</h2>
        <table>
          <tbody>
            <tr><th>Events</th><td>{fmtNum(stats.events)}</td></tr>
            <tr><th>Input</th><td>{fmtNum(stats.lifetime.input)}</td></tr>
            <tr><th>Output</th><td>{fmtNum(stats.lifetime.output)}</td></tr>
            <tr><th>Cache read</th><td>{fmtNum(stats.lifetime.cacheRead)}</td></tr>
            <tr><th>Cache create</th><td>{fmtNum(stats.lifetime.cacheCreate)}</td></tr>
            <tr><th>Total tokens</th><td>{fmtNum(tokenTotal(stats.lifetime))}</td></tr>
            <tr><th>Cost</th><td>{fmtUsd(stats.totalCostUsd)}</td></tr>
            <tr><th>Range</th><td>{fmtTime(stats.firstTs)} → {fmtTime(stats.lastTs)}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="windows">
        <h2>Recent</h2>
        <table>
          <thead><tr><th></th><th>Last 24h</th><th>Last 7d</th></tr></thead>
          <tbody>
            <tr><th>Input</th>        <td>{fmtNum(stats.last24h.input)}</td><td>{fmtNum(stats.last7d.input)}</td></tr>
            <tr><th>Output</th>       <td>{fmtNum(stats.last24h.output)}</td><td>{fmtNum(stats.last7d.output)}</td></tr>
            <tr><th>Cache read</th>   <td>{fmtNum(stats.last24h.cacheRead)}</td><td>{fmtNum(stats.last7d.cacheRead)}</td></tr>
            <tr><th>Cache create</th> <td>{fmtNum(stats.last24h.cacheCreate)}</td><td>{fmtNum(stats.last7d.cacheCreate)}</td></tr>
            <tr><th>Total</th>        <td>{fmtNum(tokenTotal(stats.last24h))}</td><td>{fmtNum(tokenTotal(stats.last7d))}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>By source</h2>
        {stats.bySource.length === 0 ? <p className="empty">No events yet.</p> : (
          <table>
            <thead><tr><th>Source</th><th>Events</th><th>Input</th><th>Output</th></tr></thead>
            <tbody>
              {stats.bySource.map(s => (
                <tr key={s.source}>
                  <th>{s.source}</th>
                  <td>{fmtNum(s.events)}</td>
                  <td>{fmtNum(s.input)}</td>
                  <td>{fmtNum(s.output)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <button className="refresh" onClick={reload}>Refresh</button>
    </div>
  );
}
