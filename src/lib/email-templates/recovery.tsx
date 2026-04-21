import { Body, Button, Container, Img, Head, Heading, Html, Preview, Text } from '@react-email/components';
import * as React from 'react'
import { main, container, eyebrow, h1, text, button, divider, footer, LOGO_URL, logoImg } from './_brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="VPS Finest" style={logoImg} />
        <Text style={eyebrow}>{siteName}</Text>
        <Heading style={h1}>Reset your password.</Heading>
        <Text style={text}>
          We received a request to reset the password for your {siteName} account.
          Choose a new one using the button below.
        </Text>
        <Button style={button} href={confirmationUrl}>Reset password</Button>
        <hr style={divider} />
        <Text style={footer}>
          If you didn't request this, you can safely ignore this email — your password won't be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
