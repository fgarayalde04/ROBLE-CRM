/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pdfjs-dist', 'docusign-esign'],
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
}
module.exports = nextConfig
