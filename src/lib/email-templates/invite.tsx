import * as React from 'react'
import { Body } from '@react-email/body'
import { Button } from '@react-email/button'
import { Container } from '@react-email/container'
import { Head } from '@react-email/head'
import { Heading } from '@react-email/heading'
import { Html } from '@react-email/html'
import { Link } from '@react-email/link'
import { Preview } from '@react-email/preview'
import { Text } from '@react-email/text'
import { main, container, eyebrow, h1, text, link, button, divider, footer } from './_brand'

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
