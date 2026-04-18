import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Text,
} from '@react-email/components'
import { main, container, eyebrow, h1, text, link, button, divider, footer } from './_brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to finish signing up for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{siteName}</Text>
        <Heading style={h1}>Welcome.</Heading>
        <Text style={text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={link}>{siteName}</Link>. Confirm your email
          ({recipient}) to finish setting up your account.
        </Text>
        <Button style={button} href={confirmationUrl}>Verify email</Button>
        <hr style={divider} />
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this message.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
