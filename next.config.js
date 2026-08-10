/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pdfjs-dist', 'docusign-esign', '@sparticuz/chromium-min', 'playwright-core', 'pg'],
    // Tell Vercel file tracer to include the DOCX templates in the serverless bundle
    outputFileTracingIncludes: {
      '/api/bc-ficha/generate': ['./public/bc-templates/**'],
    },
  },
  // Allow uploading files up to 100 MB
  api: {
    bodyParser:    { sizeLimit: '100mb' },
    responseLimit: '100mb',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'pg', 'pg-native']
    }
    return config
  },
}
module.exports = nextConfig
