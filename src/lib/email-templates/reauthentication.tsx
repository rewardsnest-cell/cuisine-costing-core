import { Body, Container, Img, Head, Heading, Html, Preview, Text } from '@react-email/components';
import * as React from 'react'
import { main, container, eyebrow, h1, text, divider, footer, codeBox, LOGO_URL, logoImg } from './_brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="VPS Finest" style={logoImg} />
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
