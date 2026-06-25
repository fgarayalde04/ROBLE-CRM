/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pdfjs-dist', 'docusign-esign'],
  },
  // Allow uploading files up to 100 MB
  api: {
    bodyParser:    { sizeLimit: '100mb' },
    responseLimit: '100mb',
  },
}
module.exports = nextConfig
