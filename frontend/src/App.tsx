import { useState, useEffect } from 'react'
import { AppConfig, UserSession, showConnect, UserData } from '@stacks/connect'
import { Activity, Coins, Zap } from 'lucide-react'
import Header from './components/Header'
import WalletConnect from './components/WalletConnect'
import StreamDashboard from './components/StreamDashboard'
// import CreateStreamForm from './components/CreateStreamForm'
import AnalyticsDashboard from './components/AnalyticsDashboard'

function App() {
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const [_userData, setUserData] = useState<UserData | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'analytics'>('dashboard')

  const appConfig = new AppConfig(['store_write', 'publish_data'])
  const session = new UserSession({ appConfig })

  useEffect(() => {
    if (session.isSignInPending()) {
      session.handlePendingSignIn().then((userData) => {
        setUserSession(session)
        setUserData(userData)
      })
    } else if (session.isUserSignedIn()) {
      setUserSession(session)
      setUserData(session.loadUserData())
    }
  }, [])

  const connectWallet = () => {
    showConnect({
      appDetails: {
        name: 'StreamFlow',
        icon: window.location.origin + '/vite.svg',
      },
      redirectTo: '/',
      onFinish: () => {
        window.location.reload()
      },
      userSession: session,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {!userSession ? (
          <div className="text-center">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-center mb-6">
                <Zap className="h-12 w-12 text-blue-600 mr-4" />
                <h1 className="text-5xl font-bold text-gray-900">StreamFlow</h1>
              </div>
              <p className="text-xl text-gray-600 mb-8">
                Continuous BTC-denominated payment streaming settled in STX.
                Experience the future of salary payments and subscriptions.
              </p>
              <div className="grid md:grid-cols-3 gap-8 mb-12">
                <div className="bg-white rounded-lg p-6 shadow-lg">
                  <Activity className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Continuous Streaming</h3>
                  <p className="text-gray-600">Real-time payment streams with customizable cliff periods and vesting schedules.</p>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-lg">
                  <Zap className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">BTC-Denominated</h3>
                  <p className="text-gray-600">Payments denominated in BTC but settled in STX for instant transactions.</p>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-lg">
                  <Coins className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">NFT Streams</h3>
                  <p className="text-gray-600">Composable Stream NFTs for transferability and secondary market trading.</p>
                </div>
              </div>
              <WalletConnect onConnect={connectWallet} />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Navigation Tabs */}
            <div className="flex justify-center">
              <div className="bg-white rounded-lg p-1 shadow-sm border">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-blue-600'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('create')}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    activeTab === 'create'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-blue-600'
                  }`}
                  disabled
                >
                  Create Stream (Coming Soon)
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    activeTab === 'analytics'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-blue-600'
                  }`}
                >
                  Analytics
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to StreamFlow</h1>
              <p className="text-gray-600">Manage your payment streams with confidence</p>
            </div>

            {activeTab === 'dashboard' && <StreamDashboard userSession={userSession} />}
            {/* {activeTab === 'create' && <CreateStreamForm userSession={userSession} />} */}
            {activeTab === 'analytics' && <AnalyticsDashboard userSession={userSession} />}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
