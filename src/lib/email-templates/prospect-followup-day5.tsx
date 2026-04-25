import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

interface Props {
  contactName?: string
  businessName?: string
}

const Day5FollowUp = ({ contactName, businessName }: Props) => {
  const greeting = contactName ? `Hi ${contactName},` : (businessName ? `Hi ${businessName} team,` : 'Hi,')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Just checking in — local catering</Preview>
      <Body style={brand.main}>
        <Container style={brand.container}>
          <Text style={brand.eyebrow}>VPS Finest · Catering</Text>
          <Heading style={brand.h1}>Just checking in</Heading>
          <Text style={brand.text}>{greeting}</Text>
          <Text style={brand.text}>
            Just following up in case my note got buried. Happy to share menus or stop by anytime.
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
  component: Day5FollowUp,
  subject: 'Just checking in — local catering',
  displayName: 'Prospect follow-up · Day 5',
  previewData: { contactName: 'Pat', businessName: 'Bertram Inn' },
} satisfies TemplateEntry
