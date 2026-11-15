declare const process: {
  env: Record<string, string | undefined>;
};

export type TestEnvConfig = {
  envName: string;
  state: Record<string, string>;
  tagaBaseWebUrl: string;
  tagaBaseApiUrl: string;
  tagbBaseWebUrl: string;
  tagbBaseApiUrl: string;
  tagbBaseApiUrlWithoutSubscription: string;
  tagcBaseWebUrl: string;
  tagcBaseApiUrl: string;
};

const ENV = {
  TAGA_PRIMARY_SUBSCRIPTION_ID: 'sub-taga-primary-001',
  TAGA_SECONDARY_SUBSCRIPTION_ID: 'sub-taga-secondary-002',
  TAGA_LEGACY_SUBSCRIPTION_ID: 'sub-taga-legacy-003',
  TAGA_REGIONAL_SUBSCRIPTION_ID: 'sub-taga-regional-004',
  ENV_QA_SUBSCRIPTION_ID: 'sub-env-qa-101',
  ENV_DEMO_SUBSCRIPTION_ID: 'sub-env-demo-102',
  ENV_DEV_SUBSCRIPTION_ID: 'sub-env-dev-103',
  REGION_US_SUBSCRIPTION_ID: 'sub-region-us-104',
  REGION_EU_SUBSCRIPTION_ID: 'sub-region-eu-105',
  ENV_PROD_SUBSCRIPTION_ID: 'sub-env-prod-106',
  TAGB_BILLING_SUBSCRIPTION_ID: 'sub-tagb-billing-201',
  TAGC_AUDIT_SUBSCRIPTION_ID: 'sub-tagc-audit-301',
};

export function resolveTestEnv(projectName?: string): TestEnvConfig {
  const envName = projectName || process.env.TEST_ENV || 'qa';
  return {
    envName,
    state: {
      'https://taga.example.test': 'token-taga-qa',
      'https://tagb.example.test': 'token-tagb-qa',
      'https://tagc.example.test': 'token-tagc-qa',
    },
    tagaBaseWebUrl: 'https://taga.example.test',
    tagaBaseApiUrl: 'https://api.taga.example.test',
    tagbBaseWebUrl: 'https://tagb.example.test',
    tagbBaseApiUrl: 'https://api.tagb.example.test',
    tagbBaseApiUrlWithoutSubscription: 'https://api.tagb.example.test/public',
    tagcBaseWebUrl: 'https://tagc.example.test',
    tagcBaseApiUrl: 'https://api.tagc.example.test',
  };
}

export function requireServiceBaseApiUrl(envName: string): string {
  return process.env.SERVICE_BASE_API_URL || `https://service.${envName}.example.test/api`;
}

export function requireServiceCredentials(): { subscriptionId: string; basicToken: string } {
  return {
    subscriptionId: process.env.SERVICE_SUBSCRIPTION_ID || 'sub-service-001',
    basicToken: process.env.SERVICE_BASIC_TOKEN || 'dGVzdC1zZXJ2aWNlLXRva2Vu',
  };
}

export default ENV;
