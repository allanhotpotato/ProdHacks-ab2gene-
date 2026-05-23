export interface ChatMessage {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

export interface ChatRequestBody {
  grantContext?: unknown;
  profileContext?: unknown;
  messages?: unknown;
  accessToken?: unknown;
}

export interface AutofillFieldRequestBody {
  questionText?: unknown;
  fieldKey?: unknown;
  descriptor?: unknown;
  tagName?: unknown;
  inputType?: unknown;
  pageTitle?: unknown;
  pageUrl?: unknown;
  organizationProfile?: unknown;
  grantContext?: unknown;
  userId?: unknown;
}

export interface GoogleFormPrefillBody {
  formId?: string;
  organizationProfile?: string;
  entryIds?: Record<string, string>;
  questions?: Record<string, string>;
  userId?: string;
}

export interface SmartMatchRequestBody {
  organizationProfile?: string;
  grants?: unknown[];
  topN?: number;
}

export interface ExtractProfileBody {
  text?: string;
}

export interface CatalogGrant {
  id: string;
  opportunity_title: string;
  provider: string;
  category: string;
  funding_min: number | null;
  funding_max: number | null;
  geographic_scope: string;
  states_eligible: string[];
  eligibility_types: string[];
  focus_areas: string[];
  target_population: string;
  description: string;
  application_url: string;
  deadline_type: string;
  typical_deadline_month: number | null;
  is_recurring: boolean;
  notes: string;
}
