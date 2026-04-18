// Shared brand styles for VPS Finest auth emails — cream/serif look.
// Body must remain white per email infra rules; the inner card carries the cream tone.

export const LOGO_URL =
  'https://qzxndabxkzhplhspkkoi.supabase.co/storage/v1/object/public/site-assets/brand/vpsfinest-logo.png'

export const logoImg = {
  display: 'block',
  margin: '0 auto 20px',
  height: '64px',
  width: 'auto',
}

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: '#2a2622',
  margin: 0,
  padding: '32px 16px',
}

export const container = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: '#faf6ef',
  border: '1px solid #ece4d3',
  padding: '48px 40px',
}

export const eyebrow = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '11px',
  letterSpacing: '0.28em',
  textTransform: 'uppercase' as const,
  color: '#8a7a63',
  margin: '0 0 24px',
}

export const h1 = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '30px',
  fontWeight: 'bold' as const,
  lineHeight: '1.15',
  color: '#2a2622',
  margin: '0 0 24px',
  letterSpacing: '-0.01em',
}

export const text = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '16px',
  lineHeight: '1.65',
  color: '#4a4339',
  margin: '0 0 22px',
  fontWeight: 'normal' as const,
}

export const link = {
  color: '#2a2622',
  textDecoration: 'underline',
}

export const button = {
  backgroundColor: '#2a2622',
  color: '#faf6ef',
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '13px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  borderRadius: '2px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '4px 0 8px',
}

export const divider = {
  border: 'none',
  borderTop: '1px solid #ece4d3',
  margin: '32px 0 24px',
}

export const footer = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '12px',
  lineHeight: '1.6',
  color: '#8a7a63',
  margin: '0',
  fontStyle: 'italic' as const,
}

export const codeBox = {
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.4em',
  color: '#2a2622',
  backgroundColor: '#ffffff',
  border: '1px solid #ece4d3',
  padding: '20px 24px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
