'use client';

import { useMemo, useState } from 'react';
import { scoreColor } from '../../lib/curation';

const SORT_FIELDS = {
  date: (item) => new Date(item.pub_date || 0).getTime(),
  score: (item) => (item.score ?? -1),
  urgency: (item) => (item.urgency_score ?? -1),
  policy: (item) => (item.policy_relevance ?? -1),
};

export default function DashboardTable({ headlines }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [sourceFilter, setSourceFilter] = useState('all');

  const sources = useMemo(() => {
    const set = new Set(headlines.map((h) => h.source));
    return ['all', ...Array.from(set).sort()];
  }, [headlines]);

  const rows = useMemo(() => {
    const filtered = sourceFilter === 'all' ? headlines : headlines.filter((h) => h.source === sourceFilter);
    const getValue = SORT_FIELDS[sortField];
    return [...filtered].sort((a, b) => {
      const diff = getValue(a) - getValue(b);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [headlines, sourceFilter, sortField, sortDir]);

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
        <span className="dashboard-count">{rows.length} stories</span>
      </div>

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
                Source / Date{sortIndicator('date')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
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
                    {item.pub_date ? new Date(item.pub_date).toLocaleDateString() : '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
