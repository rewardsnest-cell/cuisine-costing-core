import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

interface Props {
  contactName?: string
  businessName?: string
}

const Day0Intro = ({ contactName, businessName }: Props) => {
  const greeting = contactName
    ? `Hi ${contactName},`
    : (businessName ? `Hi ${businessName} team,` : 'Hi,')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Local Aurora caterer — quick intro</Preview>
      <Body style={brand.main}>
        <Container style={brand.container}>
          <Text style={brand.eyebrow}>VPS Finest · Catering</Text>
          <Heading style={brand.h1}>Quick intro from a local Aurora caterer</Heading>
          <Text style={brand.text}>{greeting}</Text>
          <Text style={brand.text}>
            I'm Anthony with VPS Finest, a small full-service catering company based in Aurora, OH.
            We handle weddings, corporate lunches, fundraisers, and private events across Northeast Ohio.
          </Text>
          <Text style={brand.text}>
            If you ever need a reliable local caterer
            {businessName ? ` for events at ${businessName}` : ''}, I'd love to be on your short list.
            Happy to send menus, pricing, or stop by anytime that's convenient.
          </Text>
          <Text style={brand.text}>— Anthony, VPS Finest</Text>
          <Hr style={brand.divider} />
          <Text style={brand.footer}>
            VPS Finest · Aurora, OH · vpsfinest.com
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Day0Intro,
  subject: 'Quick intro — local Aurora caterer (VPS Finest)',
  displayName: 'Prospect intro · Day 0',
  previewData: { contactName: 'Pat', businessName: 'Bertram Inn' },
} satisfies TemplateEntry
