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

interface Props {
  recipeName?: string
  recipeUrl?: string
  printableUrl?: string
  leadMagnet?: string // 'printable' | 'scaling' | 'checklist' | 'pack'
}

const LABELS: Record<string, { title: string; cta: string }> = {
  printable: { title: 'Your printable recipe is ready', cta: 'Download printable PDF' },
  scaling: { title: 'Your party-size scaling guide', cta: 'Download scaling guide' },
  checklist: { title: 'Your event prep checklist', cta: 'Download prep checklist' },
  pack: { title: 'Your 3-recipe mini pack', cta: 'View your recipes' },
}

const RecipeWelcomeEmail = ({ recipeName, recipeUrl, printableUrl, leadMagnet = 'printable' }: Props) => {
  const label = LABELS[leadMagnet] || LABELS.printable
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{label.title}{recipeName ? ` — ${recipeName}` : ''}</Preview>
      <Body style={brand.main}>
        <Container style={brand.container}>
          <Text style={brand.eyebrow}>VPS Finest · Aurora, Ohio</Text>
          <Heading style={brand.h1}>{label.title}</Heading>
          <Text style={brand.text}>
            Thanks for cooking with us{recipeName ? ` — here's your copy of ${recipeName}.` : '.'} Save it,
            print it, scale it for your next gathering.
          </Text>
          {printableUrl && (
            <Button href={printableUrl} style={brand.button}>{label.cta}</Button>
          )}
          {recipeUrl && (
            <Text style={{ ...brand.text, fontSize: '14px', marginTop: '20px' }}>
              Or open the full recipe online:{' '}
              <a href={recipeUrl} style={brand.link}>{recipeName || 'View recipe'}</a>
            </Text>
          )}
          <Hr style={brand.divider} />
          <Text style={brand.footer}>
            Over the next week we'll share a few related recipes, the tools we actually use, and — only if you're hosting
            — how we handle catering. Reply anytime; a real person reads every email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RecipeWelcomeEmail,
  subject: (data: Record<string, any>) => {
    const label = LABELS[data.leadMagnet || 'printable'] || LABELS.printable
    return data.recipeName ? `${label.title} — ${data.recipeName}` : label.title
  },
  displayName: 'Recipe — Welcome (Email 1)',
  previewData: {
    recipeName: 'Smoky Brisket Sliders',
    recipeUrl: 'https://www.vpsfinest.com/recipes/example',
    printableUrl: 'https://www.vpsfinest.com/recipes/example/printable.pdf',
    leadMagnet: 'printable',
  },
} satisfies TemplateEntry
