import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from '@react-email/components';
import type { TemplateEntry } from './registry'
import * as brand from './_brand'

interface RelatedItem { name: string; url: string; hook?: string }

interface Props { related?: RelatedItem[] }

const RecipeRelatedEmail = ({ related = [] }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Three more recipes you'll actually cook</Preview>
    <Body style={brand.main}>
      <Container style={brand.container}>
        <Text style={brand.eyebrow}>From our kitchen</Text>
        <Heading style={brand.h1}>Three more we cook on repeat</Heading>
        <Text style={brand.text}>
          Same calm, reliable approach as the recipe you saved. Pick one for this week.
        </Text>
        {related.length === 0 && (
          <Text style={brand.text}>
            Browse all of our recipes:{' '}
            <a href="https://www.vpsfinest.com/recipes" style={brand.link}>vpsfinest.com/recipes</a>
          </Text>
        )}
        {related.map((r, i) => (
          <div key={i}>
            <Hr style={brand.divider} />
            <Text style={{ ...brand.text, fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px' }}>
              <a href={r.url} style={{ color: '#2a2622', textDecoration: 'none' }}>{r.name}</a>
            </Text>
            {r.hook && <Text style={{ ...brand.text, margin: '0 0 8px' }}>{r.hook}</Text>}
            <Text style={{ ...brand.text, fontSize: '14px', margin: 0 }}>
              <a href={r.url} style={brand.link}>Open recipe →</a>
            </Text>
          </div>
        ))}
        <Hr style={brand.divider} />
        <Text style={brand.footer}>
          You're receiving this because you saved a recipe at vpsfinest.com.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RecipeRelatedEmail,
  subject: 'Three more recipes you\'ll actually cook',
  displayName: 'Recipe — Related (Email 2)',
  previewData: {
    related: [
      { name: 'Charred Corn Elote Dip', url: 'https://www.vpsfinest.com/recipes/a', hook: 'A 15-minute crowd-pleaser.' },
      { name: 'Bourbon Peach BBQ Wings', url: 'https://www.vpsfinest.com/recipes/b', hook: 'Sticky, smoky, gone in five.' },
      { name: 'Whipped Feta with Hot Honey', url: 'https://www.vpsfinest.com/recipes/c', hook: 'The dip everyone asks about.' },
    ],
  },
} satisfies TemplateEntry
