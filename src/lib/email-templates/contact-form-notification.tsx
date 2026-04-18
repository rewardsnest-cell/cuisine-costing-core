import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface ContactFormNotificationProps {
  name?: string
  email?: string
  message?: string
}

const ContactFormNotification = ({ name, email, message }: ContactFormNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New contact form submission from {name || 'a visitor'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New contact form submission</Heading>
        <Text style={label}>From</Text>
        <Text style={value}>{name || 'Anonymous'}{email ? ` <${email}>` : ''}</Text>
        <Hr style={hr} />
        <Text style={label}>Message</Text>
        <Text style={value}>{message || '(no message)'}</Text>
        <Hr style={hr} />
        <Text style={footer}>Sent from vpsfinest.com contact form</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactFormNotification,
  subject: (data: Record<string, any>) =>
    `New contact form submission${data.name ? ` from ${data.name}` : ''}`,
  displayName: 'Contact form notification',
  to: 'hello@vpsfinest.com',
  previewData: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Hi, I would like a quote for a wedding of 80 guests in June.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'normal', color: '#1a1a1a', margin: '0 0 24px' }
const label = { fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: '#999', margin: '0 0 6px' }
const value = { fontSize: '15px', color: '#1a1a1a', lineHeight: '1.6', margin: '0 0 20px', whiteSpace: 'pre-wrap' as const }
const hr = { border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }
