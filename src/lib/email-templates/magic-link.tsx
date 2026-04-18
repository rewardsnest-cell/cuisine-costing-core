import * as React from 'react'
import { Body } from '@react-email/body'
import { Button } from '@react-email/button'
import { Container } from '@react-email/container'
import { Head } from '@react-email/head'
import { Heading } from '@react-email/heading'
import { Html } from '@react-email/html'
import { Preview } from '@react-email/preview'
import { Text } from '@react-email/text'
import { main, container, eyebrow, h1, text, button, divider, footer } from './_brand'

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
