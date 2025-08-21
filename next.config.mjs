import withPWA from 'next-pwa';
const isDev = process.env.NODE_ENV === 'development';
const withPWAConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev,
});
export default withPWAConfig({ reactStrictMode: true });
