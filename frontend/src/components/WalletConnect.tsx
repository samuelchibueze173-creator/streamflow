import { Wallet } from 'lucide-react'

interface WalletConnectProps {
  onConnect: () => void
}

const WalletConnect = ({ onConnect }: WalletConnectProps) => {
  return (
    <div className="text-center">
      <button
        onClick={onConnect}
        className="btn-primary inline-flex items-center space-x-2"
      >
        <Wallet className="h-5 w-5" />
        <span>Connect Wallet</span>
      </button>
      <p className="text-sm text-gray-500 mt-4">
        Connect your Stacks wallet to start creating and managing payment streams
      </p>
    </div>
  )
}

export default WalletConnect
