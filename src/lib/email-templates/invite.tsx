import { Body, Button, Container, Img, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';
import * as React from 'react'
import { main, container, eyebrow, h1, text, link, button, divider, footer, LOGO_URL, logoImg } from './_brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="VPS Finest" style={logoImg} />
        <Text style={eyebrow}>{siteName}</Text>
        <Heading style={h1}>You're invited.</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>{siteName}</Link>. Accept below to create your account.
        </Text>
        <Button style={button} href={confirmationUrl}>Accept invitation</Button>
        <hr style={divider} />
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
