import { Fragment, useEffect, useState } from 'react';
import type { PetSnapshot } from '@core/types';
import { STAGES, nextThreshold } from '@core/pet/stages';
import { tokensToNutrition } from '@core/feeding/nutrition';

// Inlined to avoid pulling better-sqlite3 into the renderer bundle.
interface TokenSum { input: number; output: number; cacheRead: number; cacheCreate: number }
interface SourceBreakdown extends TokenSum { source: string; events: number }
interface EventStats {
  events: number;
  totalCostUsd: number;
  firstTs: number | null;
  lastTs:  number | null;
  lifetime: TokenSum;
  today:    TokenSum;
  last24h:  TokenSum;
  last7d:   TokenSum;
  bySource: SourceBreakdown[];
}
interface SessionTodayRow extends TokenSum {
  sessionId: string;
  name: string | null;
  cwd: string | null;
  gitBranch: string | null;
  events: number;
  firstTs: number;
  lastTs: number;
}
interface SessionDetailRow extends TokenSum {
  ts: number;
  source: string;
  model: string | null;
}

function fmtTimeShort(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtTimeFull(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sessionLabel(row: SessionTodayRow): string {
  if (row.name) return row.name;
  if (row.cwd) {
    const seg = row.cwd.split('/').filter(Boolean).pop();
    if (seg) return seg;
  }
  return row.sessionId.slice(0, 8);
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
  const [sessions, setSessions] = useState<SessionTodayRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailRow[] | null>(null);

  const reload = () => {
    window.pet.getSnapshot().then(setSnap);
    window.pet.getStats().then(setStats);
    window.pet.todayBySession().then(setSessions);
  };

  useEffect(() => {
    reload();
    return window.pet.subscribe(() => reload());
  }, []);

  // refresh detail when expanded row changes, and whenever session list refreshes
  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    window.pet.sessionDetailToday(expanded).then(setDetail);
  }, [expanded, sessions]);

  const toggleSession = (id: string) => {
    setExpanded(prev => (prev === id ? null : id));
  };

  if (!snap || !stats) return <div className="stats loading">Loading...</div>;

  const stageName = STAGES.find(s => s.phase === snap.phase)?.name ?? '?';
  const next = nextThreshold(snap.phase);
  const pct  = next ? Math.min(100, (snap.lifetimeXP / next) * 100) : 100;
  const createdAgo = ((Date.now() - snap.createdAt) / (24 * 60 * 60 * 1000)).toFixed(1);

  return (
    <div className="stats">
      <h1>Tokie</h1>

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
          <thead><tr><th></th><th>Today</th><th>Last 24h</th><th>Last 7d</th></tr></thead>
          <tbody>
            <tr><th>Input</th>        <td>{fmtNum(stats.today.input)}</td>        <td>{fmtNum(stats.last24h.input)}</td>        <td>{fmtNum(stats.last7d.input)}</td></tr>
            <tr><th>Output</th>       <td>{fmtNum(stats.today.output)}</td>       <td>{fmtNum(stats.last24h.output)}</td>       <td>{fmtNum(stats.last7d.output)}</td></tr>
            <tr><th>Cache read</th>   <td>{fmtNum(stats.today.cacheRead)}</td>    <td>{fmtNum(stats.last24h.cacheRead)}</td>    <td>{fmtNum(stats.last7d.cacheRead)}</td></tr>
            <tr><th>Cache create</th> <td>{fmtNum(stats.today.cacheCreate)}</td>  <td>{fmtNum(stats.last24h.cacheCreate)}</td>  <td>{fmtNum(stats.last7d.cacheCreate)}</td></tr>
            <tr><th>Total</th>        <td>{fmtNum(tokenTotal(stats.today))}</td>  <td>{fmtNum(tokenTotal(stats.last24h))}</td>  <td>{fmtNum(tokenTotal(stats.last7d))}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="today-sessions">
        <h2>Today by session</h2>
        {sessions.length === 0 ? <p className="empty">No sessions today.</p> : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th className="num">Events</th>
                <th className="num">Tokens</th>
                <th className="num">Nutrition</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const total = tokenTotal(s);
                const nutrition = tokensToNutrition({
                  input: s.input, output: s.output,
                  cacheRead: s.cacheRead, cacheCreate: s.cacheCreate
                });
                const isOpen = expanded === s.sessionId;
                return (
                  <Fragment key={s.sessionId}>
                    <tr
                      className={`session-row ${isOpen ? 'open' : ''}`}
                      onClick={() => toggleSession(s.sessionId)}
                    >
                      <td>{fmtTimeShort(s.firstTs)}–{fmtTimeShort(s.lastTs)}</td>
                      <td className="session-name" title={s.cwd ?? s.sessionId}>
                        <span className="caret">{isOpen ? '▼' : '▶'}</span> {sessionLabel(s)}
                      </td>
                      <td className="num">{fmtNum(s.events)}</td>
                      <td className="num">{fmtNum(total)}</td>
                      <td className="num">{fmtNum(Math.round(nutrition))}</td>
                    </tr>
                    {isOpen && (
                      <tr className="session-detail">
                        <td colSpan={5}>
                          {!detail ? <span className="empty">Loading…</span> : detail.length === 0 ? (
                            <span className="empty">No events.</span>
                          ) : (
                            <table className="detail">
                              <thead>
                                <tr>
                                  <th>Time</th>
                                  <th>Model</th>
                                  <th className="num">In</th>
                                  <th className="num">Out</th>
                                  <th className="num">Cache R</th>
                                  <th className="num">Cache C</th>
                                  <th className="num">Nutr.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.map((d, i) => (
                                  <tr key={i}>
                                    <td>{fmtTimeFull(d.ts)}</td>
                                    <td>{d.model ?? '—'}</td>
                                    <td className="num">{fmtNum(d.input)}</td>
                                    <td className="num">{fmtNum(d.output)}</td>
                                    <td className="num">{fmtNum(d.cacheRead)}</td>
                                    <td className="num">{fmtNum(d.cacheCreate)}</td>
                                    <td className="num">{fmtNum(Math.round(tokensToNutrition(d)))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
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
