'use client';

import { useMemo, useState } from 'react';
import { scoreColor } from '../../lib/curation';

const SORT_FIELDS = {
  date: (item) => new Date(item.pub_date || 0).getTime(),
  score: (item) => (item.score ?? -1),
  urgency: (item) => (item.urgency_score ?? -1),
  policy: (item) => (item.policy_relevance ?? -1),
};

// Grouped in the owner's local calendar day, not UTC -- otherwise a late
// evening story would misleadingly land in "tomorrow"'s group.
const DASHBOARD_TIMEZONE = 'America/Los_Angeles';

function dayKey(pubDate) {
  if (!pubDate) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', { timeZone: DASHBOARD_TIMEZONE }).format(new Date(pubDate));
}

function dayLabel(key, todayKey, yesterdayKey) {
  if (key === 'unknown') return 'Unknown date';
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

export default function DashboardTable({ headlines }) {
  const [sortField, setSortField] = useState('score');
  const [sortDir, setSortDir] = useState('desc');
  const [sourceFilter, setSourceFilter] = useState('all');

  const sources = useMemo(() => {
    const set = new Set(headlines.map((h) => h.source));
    return ['all', ...Array.from(set).sort()];
  }, [headlines]);

  const todayKey = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: DASHBOARD_TIMEZONE }).format(new Date()), []);
  const yesterdayKey = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: DASHBOARD_TIMEZONE }).format(new Date(Date.now() - 86400000)),
    []
  );

  const groups = useMemo(() => {
    const filtered = sourceFilter === 'all' ? headlines : headlines.filter((h) => h.source === sourceFilter);
    const getValue = SORT_FIELDS[sortField];

    const byDay = new Map();
    for (const item of filtered) {
      const key = dayKey(item.pub_date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(item);
    }

    // Newest day first; 'unknown' (no pub_date) sorts last regardless.
    const sortedKeys = Array.from(byDay.keys()).sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return a < b ? 1 : a > b ? -1 : 0;
    });

    return sortedKeys.map((key) => ({
      key,
      label: dayLabel(key, todayKey, yesterdayKey),
      items: [...byDay.get(key)].sort((a, b) => {
        const diff = getValue(a) - getValue(b);
        return sortDir === 'asc' ? diff : -diff;
      }),
    }));
  }, [headlines, sourceFilter, sortField, sortDir, todayKey, yesterdayKey]);

  function toggleSort(field) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function sortIndicator(field) {
    if (field !== sortField) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div>
      <div className="dashboard-controls">
        <label>
          Source:{' '}
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All sources' : s}
              </option>
            ))}
          </select>
        </label>
        <span className="dashboard-count">{totalCount} stories</span>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="dashboard-day-group">
          <h3 className="dashboard-day-heading">
            {group.label} <span className="dashboard-day-count">({group.items.length})</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th></th>
                  <th className="sortable" onClick={() => toggleSort('score')}>
                    Breakout{sortIndicator('score')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('urgency')}>
                    Urgent{sortIndicator('urgency')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('policy')}>
                    Policy{sortIndicator('policy')}
                  </th>
                  <th>Headline</th>
                  <th className="sortable" onClick={() => toggleSort('date')}>
                    Source / Time{sortIndicator('date')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="dashboard-thumb" />
                      ) : (
                        <div className="dashboard-thumb-placeholder" />
                      )}
                    </td>
                    <td style={item.score !== null ? { color: scoreColor(item.score) } : undefined}>
                      {item.score ?? '—'}
                    </td>
                    <td>{item.urgency_score ?? '—'}</td>
                    <td>{item.policy_relevance ?? '—'}</td>
                    <td className="dashboard-headline-cell">
                      <a href={item.link} target="_blank" rel="noopener noreferrer" title={item.title}>
                        {item.title}
                      </a>
                      {item.summary && item.summary.startsWith('ERROR') && (
                        <span className="dashboard-error-tag">scoring failed</span>
                      )}
                    </td>
                    <td className="dashboard-source-cell">
                      <div>{item.source}</div>
                      <div className="dashboard-date">
                        {item.pub_date
                          ? new Date(item.pub_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                          : '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
