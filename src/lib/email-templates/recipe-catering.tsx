import { Body } from '@react-email/body'
import { Container } from '@react-email/container'
import { Head } from '@react-email/head'
import { Heading } from '@react-email/heading'
import { Html } from '@react-email/html'
import { Preview } from '@react-email/preview'
import { Text } from '@react-email/text'
import { Button } from '@react-email/button'
import { Hr } from '@react-email/hr'
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

const RecipeCateringEmail = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>If you're feeding a crowd — we can help</Preview>
    <Body style={brand.main}>
      <Container style={brand.container}>
        <Text style={brand.eyebrow}>VPS Finest · Catering</Text>
        <Heading style={brand.h1}>Cooking for a crowd this season?</Heading>
        <Text style={brand.text}>
          A lot of people who follow our recipes also host. If that's you — birthdays, showers, weddings, corporate
          lunches — we cater across Northeast Ohio with the same calm, reliable food you've been cooking from us.
        </Text>
        <Text style={brand.text}>
          No pressure. If you'd like a tailored quote, it takes about two minutes.
        </Text>
        <Button href="https://www.vpsfinest.com/catering/quote" style={brand.button}>
          Request a quote
        </Button>
        <Text style={{ ...brand.text, fontSize: '14px', marginTop: '20px' }}>
          Or just browse the menu:{' '}
          <a href="https://www.vpsfinest.com/menu" style={brand.link}>vpsfinest.com/menu</a>
        </Text>
        <Hr style={brand.divider} />
        <Text style={brand.footer}>
          Last note in this short series. We'll only email occasionally with new recipes after this. Thanks for cooking with us.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RecipeCateringEmail,
  subject: 'Cooking for a crowd this season?',
  displayName: 'Recipe — Catering (Email 4)',
  previewData: {},
} satisfies TemplateEntry
