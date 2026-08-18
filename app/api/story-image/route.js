import { ImageResponse } from 'next/og';
import { supabase } from '../../../lib/supabaseClient';
import { scoreColor } from '../../../lib/curation';

export const runtime = 'edge';

const SIZE = 1080; // Instagram-native square (1:1)

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return new Response('Missing id', { status: 400 });
  }

  const { data: item, error } = await supabase
    .from('headlines')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !item) {
    return new Response('Story not found', { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#5b6169',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            Daily News
          </div>
          <div
            style={{
              display: 'flex',
              background: '#1c3fae',
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1,
              padding: '5px 14px',
              borderRadius: 6,
            }}
          >
            WIRE
          </div>
        </div>

        <div style={{ display: 'flex', marginTop: 56, gap: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', fontSize: 108, fontWeight: 800, lineHeight: 1, color: scoreColor(item.score) }}>
              {item.score.toFixed(1)}
            </div>
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: '#9aa0a8', textTransform: 'uppercase', marginTop: 10 }}>
              Breakout
            </div>
          </div>
          <div style={{ display: 'flex', flex: 1, fontSize: 54, fontWeight: 800, lineHeight: 1.25, color: '#14161a' }}>
            {item.title}
          </div>
        </div>

        {item.summary && !item.summary.startsWith('ERROR') && (
          <div style={{ display: 'flex', marginTop: 44, fontSize: 30, lineHeight: 1.5, color: '#5b6169' }}>
            {item.summary}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                background: '#f2f3f5',
                color: '#4b515a',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 1,
                padding: '10px 18px',
                borderRadius: 10,
              }}
            >
              BREAKOUT {item.score}
            </div>
            {item.policy_relevance !== null && (
              <div
                style={{
                  display: 'flex',
                  background: '#f2f3f5',
                  color: '#4b515a',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 1,
                  padding: '10px 18px',
                  borderRadius: 10,
                }}
              >
                POLICY {item.policy_relevance}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#9aa0a8', marginTop: 26 }}>{item.source}</div>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}
