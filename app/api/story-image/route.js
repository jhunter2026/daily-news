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

  // This image is shared publicly, so only public-facing text goes on it:
  // headline, score, badges, source. item.summary ("this scores high
  // because...") is internal editorial reasoning for the owner's email
  // digest and never belongs here; item.caption is written for the
  // Instagram caption field, not for baking into the image itself.
  const hasPhoto = Boolean(item.image_url);

  const allText = [
    'Daily News',
    'WIRE',
    item.score.toFixed(1),
    'Breakout',
    item.title,
    `BREAKOUT ${item.score}`,
    item.policy_relevance !== null ? `POLICY ${item.policy_relevance}` : '',
    item.source,
  ].join(' ');

  const [regular, bold] = await Promise.all([
    loadGoogleFont(allText, 400),
    loadGoogleFont(allText, 800),
  ]);

  const textColor = hasPhoto ? '#ffffff' : '#14161a';
  const mutedColor = hasPhoto ? 'rgba(255,255,255,0.75)' : '#9aa0a8';
  const badgeBg = hasPhoto ? 'rgba(255,255,255,0.15)' : '#f2f3f5';
  const badgeText = hasPhoto ? '#ffffff' : '#4b515a';

  const brandRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 3,
          color: mutedColor,
          textTransform: 'uppercase',
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
  );

  const badgeRow = (
    <div style={{ display: 'flex', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          background: badgeBg,
          color: badgeText,
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
            background: badgeBg,
            color: badgeText,
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
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter',
        }}
      >
        {hasPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            width={SIZE}
            height={SIZE}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {hasPhoto && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundImage:
                'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.05) 65%, rgba(0,0,0,0) 100%)',
            }}
          />
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: 72,
          }}
        >
          {!hasPhoto && brandRow}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: hasPhoto ? 'flex-end' : 'center',
            }}
          >
            {hasPhoto && brandRow}
            <div style={{ display: 'flex', marginTop: hasPhoto ? 32 : 0, gap: 36, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', fontSize: 108, fontWeight: 800, lineHeight: 1, color: scoreColor(item.score) }}>
                  {item.score.toFixed(1)}
                </div>
                <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: mutedColor, textTransform: 'uppercase', marginTop: 10 }}>
                  Breakout
                </div>
              </div>
              <div style={{ display: 'flex', flex: 1, fontSize: 54, fontWeight: 800, lineHeight: 1.25, color: textColor }}>
                {item.title}
              </div>
            </div>
            <div style={{ display: 'flex', marginTop: 32 }}>{badgeRow}</div>
            <div style={{ display: 'flex', fontSize: 26, color: mutedColor, marginTop: 26 }}>{item.source}</div>
          </div>
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
