import withPWA from 'next-pwa';

const isDev = process.env.NODE_ENV === 'development';

const withPWAConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev,
  // Ensure API requests are fresh after mutations
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api'),
      handler: 'NetworkFirst',
      options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
    },
  ],
});

export default withPWAConfig({ reactStrictMode: true });
