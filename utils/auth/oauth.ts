/* Which social sign-in buttons are live. */

export type OAuthProviderId = 'google' | 'github';

export type OAuthProviderConfig = {
  id: OAuthProviderId;
  label: string;
  enabled: boolean;
};

const SUPPORTED_PROVIDERS: { id: OAuthProviderId; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
];

export function getConfiguredOAuthProviders(): OAuthProviderConfig[] {
  const configured = new Set(
    (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );

  return SUPPORTED_PROVIDERS.map((provider) => ({
    ...provider,
    enabled: configured.has(provider.id),
  }));
}
