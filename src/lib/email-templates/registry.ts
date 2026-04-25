import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as contactFormNotification } from './contact-form-notification'
import { template as recipeWelcome } from './recipe-welcome'
import { template as recipeRelated } from './recipe-related'
import { template as recipeTools } from './recipe-tools'
import { template as recipeCatering } from './recipe-catering'
import { template as prospectFollowUpDay0 } from './prospect-followup-day0'
import { template as prospectFollowUpDay5 } from './prospect-followup-day5'
import { template as prospectFollowUpDay14 } from './prospect-followup-day14'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'contact-form-notification': contactFormNotification,
  'recipe-welcome': recipeWelcome,
  'recipe-related': recipeRelated,
  'recipe-tools': recipeTools,
  'recipe-catering': recipeCatering,
  'prospect-followup-day0': prospectFollowUpDay0,
  'prospect-followup-day5': prospectFollowUpDay5,
  'prospect-followup-day14': prospectFollowUpDay14,
}
