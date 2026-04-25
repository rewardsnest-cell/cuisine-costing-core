import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

interface Props {
  contactName?: string
  businessName?: string
}

const Day14FollowUp = ({ contactName, businessName }: Props) => {
  const greeting = contactName ? `Hi ${contactName},` : (businessName ? `Hi ${businessName} team,` : 'Hi,')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Quick check-in</Preview>
      <Body style={brand.main}>
        <Container style={brand.container}>
          <Text style={brand.eyebrow}>VPS Finest · Catering</Text>
          <Heading style={brand.h1}>Quick check-in</Heading>
          <Text style={brand.text}>{greeting}</Text>
          <Text style={brand.text}>
            Just wanted to check once more. Happy to help if catering needs come up.
          </Text>
          <Text style={brand.text}>— Anthony</Text>
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
  component: Day14FollowUp,
  subject: 'Quick check-in',
  displayName: 'Prospect follow-up · Day 14',
  previewData: { contactName: 'Pat', businessName: 'Bertram Inn' },
} satisfies TemplateEntry
