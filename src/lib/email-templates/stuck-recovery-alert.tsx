import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry'

interface Props {
  run_id?: string
  stage?: string
  stuck_for_minutes?: number
  threshold?: number
  started_at?: string | null
  counts_in?: number
  counts_out?: number
  warnings_count?: number
  errors_count?: number
  details_url?: string
}

const StuckRecoveryAlert = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Pricing v2 bootstrap auto-recovery — run stuck ${p.stuck_for_minutes ?? '?'}m`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Pricing v2: stuck-run auto-recovery</Heading>
        <Text style={text}>
          A {p.stage ?? 'catalog'} bootstrap run was stuck in <strong>running</strong> for ~
          <strong>{p.stuck_for_minutes ?? '?'} minute{p.stuck_for_minutes === 1 ? '' : 's'}</strong>
          {' '}(threshold: {p.threshold ?? '?'}m) and has been auto-recovered.
        </Text>
        <Hr style={hr} />
        <Section>
          <Text style={label}>Run ID</Text>
          <Text style={mono}>{p.run_id ?? '—'}</Text>
          <Text style={label}>Started</Text>
          <Text style={value}>{p.started_at ?? '—'}</Text>
          <Text style={label}>Counts at recovery</Text>
          <Text style={value}>
            in: {p.counts_in ?? 0} · out: {p.counts_out ?? 0} · warn: {p.warnings_count ?? 0} · err: {p.errors_count ?? 0}
          </Text>
        </Section>
        {p.details_url && (
          <Section style={{ marginTop: 24 }}>
            <Button href={p.details_url} style={button}>Open admin → Catalog</Button>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>Automated alert from pricing_v2 bootstrap monitor.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StuckRecoveryAlert,
  subject: (d: Record<string, any>) =>
    `[Pricing v2] Stuck-run auto-recovered (~${d.stuck_for_minutes ?? '?'}m)`,
  displayName: 'Stuck-run recovery alert',
  previewData: {
    run_id: '00000000-0000-0000-0000-000000000000',
    stage: 'catalog',
    stuck_for_minutes: 47,
    threshold: 30,
    started_at: '2026-04-25T12:00:00Z',
    counts_in: 0, counts_out: 0, warnings_count: 0, errors_count: 0,
    details_url: 'https://example.com/admin/pricing-v2/catalog',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 'normal' as const, color: '#1a1a1a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#1a1a1a', lineHeight: '1.6', margin: '0 0 12px' }
const label = { fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: '#999', margin: '12px 0 4px' }
const value = { fontSize: '14px', color: '#1a1a1a', margin: '0 0 8px' }
const mono = { ...value, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '13px' }
const hr = { border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }
const button = { backgroundColor: '#1a1a1a', color: '#fff', padding: '10px 18px', borderRadius: '4px', textDecoration: 'none', fontSize: '14px' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }
