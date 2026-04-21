import { Body, Button, Container, Img, Head, Heading, Html, Preview, Text } from '@react-email/components';
import * as React from 'react'
import { main, container, eyebrow, h1, text, button, divider, footer, LOGO_URL, logoImg } from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your sign-in link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="VPS Finest" style={logoImg} />
        <Text style={eyebrow}>{siteName}</Text>
        <Heading style={h1}>Your sign-in link.</Heading>
        <Text style={text}>
          Click below to sign in to {siteName}. This link expires shortly.
        </Text>
        <Button style={button} href={confirmationUrl}>Sign in</Button>
        <hr style={divider} />
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
