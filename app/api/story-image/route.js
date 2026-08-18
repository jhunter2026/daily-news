import { ImageResponse } from 'next/og';
import { supabase } from '../../../lib/supabaseClient';
import { scoreColor } from '../../../lib/curation';

export const runtime = 'edge';

const SIZE = 1080; // Instagram-native square (1:1)

// Satori (which ImageResponse uses) has no default bold variant, so
// fontWeight: 700/800 silently renders as regular unless real weighted font
// data is supplied. Text-subsetted (?text=) Google Fonts requests return a
// truetype/opentype src Satori can parse, unlike the woff2 a normal browser
// request gets.
async function loadGoogleFont(text, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(opentype|truetype)'\)/);
  if (!match) {
    throw new Error(`Could not find a truetype/opentype source for Inter weight ${weight}`);
  }
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

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

  const allText = [
    'Daily News',
    'WIRE',
    item.score.toFixed(1),
    'Breakout',
    item.title,
    item.summary && !item.summary.startsWith('ERROR') ? item.summary : '',
    `BREAKOUT ${item.score}`,
    item.policy_relevance !== null ? `POLICY ${item.policy_relevance}` : '',
    item.source,
  ].join(' ');

  const [regular, bold] = await Promise.all([
    loadGoogleFont(allText, 400),
    loadGoogleFont(allText, 800),
  ]);

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
          fontFamily: 'Inter',
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
    {
      width: SIZE,
      height: SIZE,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 800, style: 'normal' },
      ],
    }
  );
}
