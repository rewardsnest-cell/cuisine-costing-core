import * as React from 'react'
import { Body } from '@react-email/body'
import { Container } from '@react-email/container'
import { Head } from '@react-email/head'
import { Heading } from '@react-email/heading'
import { Html } from '@react-email/html'
import { Preview } from '@react-email/preview'
import { Text } from '@react-email/text'
import { main, container, eyebrow, h1, text, divider, footer, codeBox } from './_brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Verification</Text>
        <Heading style={h1}>Confirm it's you.</Heading>
        <Text style={text}>Enter the code below to confirm your identity:</Text>
        <Text style={codeBox}>{token}</Text>
        <hr style={divider} />
        <Text style={footer}>
          This code expires shortly. If you didn't request it, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
