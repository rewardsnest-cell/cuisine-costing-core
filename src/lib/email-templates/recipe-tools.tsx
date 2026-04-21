import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

interface ToolItem { name: string; benefit?: string; url: string }
interface Props { tools?: ToolItem[]; recipeName?: string }

const RecipeToolsEmail = ({ tools = [], recipeName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>The tools we actually use{recipeName ? ` for ${recipeName}` : ''}</Preview>
    <Body style={brand.main}>
      <Container style={brand.container}>
        <Text style={brand.eyebrow}>The kit we reach for</Text>
        <Heading style={brand.h1}>What we actually use</Heading>
        <Text style={brand.text}>
          Nothing fancy — just the tools that make {recipeName ? recipeName : 'these recipes'} go smoothly. We earn a small
          commission if you buy through these links, at no extra cost to you.
        </Text>
        {tools.length === 0 && (
          <Text style={brand.text}>
            Browse our recipes for product picks:{' '}
            <a href="https://www.vpsfinest.com/recipes" style={brand.link}>vpsfinest.com/recipes</a>
          </Text>
        )}
        {tools.map((t, i) => (
          <div key={i}>
            <Hr style={brand.divider} />
            <Text style={{ ...brand.text, fontSize: '17px', fontWeight: 'bold', margin: '0 0 6px' }}>
              <a href={t.url} style={{ color: '#2a2622', textDecoration: 'none' }}>{t.name}</a>
            </Text>
            {t.benefit && <Text style={{ ...brand.text, margin: '0 0 8px', fontSize: '14px' }}>{t.benefit}</Text>}
            <Text style={{ ...brand.text, fontSize: '13px', margin: 0 }}>
              <a href={t.url} style={brand.link}>See on Amazon →</a>
            </Text>
          </div>
        ))}
        <Hr style={brand.divider} />
        <Text style={brand.footer}>
          This email contains affiliate links. We may earn a commission if you make a purchase, at no extra cost to you.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RecipeToolsEmail,
  subject: 'The tools we actually use',
  displayName: 'Recipe — Tools (Email 3)',
  previewData: {
    recipeName: 'Smoky Brisket Sliders',
    tools: [
      { name: 'Cast iron skillet', benefit: 'Even heat, lifetime tool.', url: 'https://www.amazon.com/s?k=cast+iron+skillet' },
      { name: 'Instant-read thermometer', benefit: 'Stop guessing on doneness.', url: 'https://www.amazon.com/s?k=instant+read+thermometer' },
    ],
  },
} satisfies TemplateEntry
