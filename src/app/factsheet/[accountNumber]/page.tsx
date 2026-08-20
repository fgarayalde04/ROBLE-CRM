import PortfolioAccountClient from './PortfolioAccountClient'

export default function PortfolioAccountPage({ params }: { params: { accountNumber: string } }) {
  return <PortfolioAccountClient accountNumber={decodeURIComponent(params.accountNumber)} />
}
