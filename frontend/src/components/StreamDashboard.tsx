import { useState, useEffect } from 'react'
import { UserSession } from '@stacks/connect'
import { Activity, TrendingUp, Pause, Play, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface StreamDashboardProps {
  userSession: UserSession
}

interface Stream {
  id: bigint
  sender: string
  recipient: string
  btcRatePerSecond: bigint
  startTime: bigint
  endTime: bigint
  cliffTime: bigint
  totalDeposited: bigint
  totalClaimed: bigint
  paused: boolean
  pauseTime: bigint
  totalPausedDuration: bigint
  active: boolean
}

const StreamDashboard = ({ userSession }: StreamDashboardProps) => {
  const [userStreams, setUserStreams] = useState<Stream[]>([])
  const [recipientStreams, setRecipientStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)

  // Mock data - in real app, this would fetch from contract
  useEffect(() => {
    // Simulate fetching user streams
    setTimeout(() => {
      setUserStreams([
        {
          id: 1n,
          sender: userSession.loadUserData().profile.stxAddress.mainnet,
          recipient: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
          btcRatePerSecond: 1000n,
          startTime: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          endTime: BigInt(Math.floor(Date.now() / 1000) + 7200), // 2 hours from now
          cliffTime: BigInt(Math.floor(Date.now() / 1000) - 1800), // 30 minutes ago
          totalDeposited: 1000000n,
          totalClaimed: 250000n,
          paused: false,
          pauseTime: 0n,
          totalPausedDuration: 0n,
          active: true
        }
      ])

      setRecipientStreams([
        {
          id: 2n,
          sender: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          recipient: userSession.loadUserData().profile.stxAddress.mainnet,
          btcRatePerSecond: 500n,
          startTime: BigInt(Math.floor(Date.now() / 1000) - 7200), // 2 hours ago
          endTime: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
          cliffTime: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
          totalDeposited: 500000n,
          totalClaimed: 150000n,
          paused: false,
          pauseTime: 0n,
          totalPausedDuration: 0n,
          active: true
        }
      ])

      setLoading(false)
    }, 1000)
  }, [userSession])

  const getStreamStatus = (stream: Stream) => {
    if (!stream.active) return { status: 'Closed', color: 'border-gray-500', bgColor: 'bg-gray-100' }
    if (stream.paused) return { status: 'Paused', color: 'border-yellow-500', bgColor: 'bg-yellow-100' }
    return { status: 'Active', color: 'border-green-500', bgColor: 'bg-green-100' }
  }

  const calculateProgress = (stream: Stream) => {
    const now = Math.floor(Date.now() / 1000)
    const start = Number(stream.startTime)
    const end = Number(stream.endTime)
    const total = end - start
    const elapsed = now - start
    return Math.min(Math.max((elapsed / total) * 100, 0), 100)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading your streams...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Sent Streams */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <TrendingUp className="h-6 w-6 mr-2 text-blue-600" />
          Streams You've Created
        </h2>

        {userStreams.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No streams created yet. Create your first stream!</p>
        ) : (
          <div className="space-y-4">
            {userStreams.map((stream) => {
              const { status, color, bgColor } = getStreamStatus(stream)
              const progress = calculateProgress(stream)

              return (
                <div key={stream.id.toString()} className={`stream-card ${color}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Stream #{stream.id.toString()}</h3>
                      <p className="text-sm text-gray-600">To: {stream.recipient.slice(0, 10)}...</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${bgColor}`}>
                      {status}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Rate</p>
                      <p className="font-semibold">{stream.btcRatePerSecond.toString()} sat/s</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Deposited</p>
                      <p className="font-semibold">{(Number(stream.totalDeposited) / 1000000).toFixed(2)} STX</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Progress</p>
                      <p className="font-semibold">{progress.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Ends {formatDistanceToNow(new Date(Number(stream.endTime) * 1000), { addSuffix: true })}
                    </div>
                    <div className="flex space-x-2">
                      <button className="btn-secondary text-sm px-3 py-1">
                        {stream.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>
                      <button className="btn-danger text-sm px-3 py-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Received Streams */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <Activity className="h-6 w-6 mr-2 text-green-600" />
          Streams You're Receiving
        </h2>

        {recipientStreams.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No incoming streams yet.</p>
        ) : (
          <div className="space-y-4">
            {recipientStreams.map((stream) => {
              const { status, color, bgColor } = getStreamStatus(stream)
              const progress = calculateProgress(stream)
              const claimable = Math.floor(Number(stream.totalDeposited - stream.totalClaimed) * 0.1) // Mock claimable amount

              return (
                <div key={stream.id.toString()} className={`stream-card ${color}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Stream #{stream.id.toString()}</h3>
                      <p className="text-sm text-gray-600">From: {stream.sender.slice(0, 10)}...</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${bgColor}`}>
                      {status}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Rate</p>
                      <p className="font-semibold">{stream.btcRatePerSecond.toString()} sat/s</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Claimed</p>
                      <p className="font-semibold">{(Number(stream.totalClaimed) / 1000000).toFixed(2)} STX</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Claimable</p>
                      <p className="font-semibold text-green-600">{(claimable / 1000000).toFixed(2)} STX</p>
                    </div>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Ends {formatDistanceToNow(new Date(Number(stream.endTime) * 1000), { addSuffix: true })}
                    </div>
                    <button className="btn-success text-sm px-4 py-2">
                      Claim {(claimable / 1000000).toFixed(2)} STX
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default StreamDashboard
