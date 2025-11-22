import { useState, useEffect } from 'react'
import { UserSession } from '@stacks/connect'
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react'

interface AnalyticsDashboardProps {
  userSession: UserSession
}

const AnalyticsDashboard = ({ userSession }: AnalyticsDashboardProps) => {
  const [analytics, setAnalytics] = useState({
    totalStreamsCreated: 0,
    totalStreamsReceived: 0,
    totalStxStreamed: 0,
    totalStxReceived: 0,
    globalVolume: 0,
    totalActiveStreams: 0
  })

  // Mock data - in real app, this would fetch from contract
  useEffect(() => {
    setTimeout(() => {
      setAnalytics({
        totalStreamsCreated: 5,
        totalStreamsReceived: 3,
        totalStxStreamed: 25000000, // 25 STX
        totalStxReceived: 15000000, // 15 STX
        globalVolume: 100000000, // 100 STX
        totalActiveStreams: 12
      })
    }, 1000)
  }, [userSession])

  const formatStx = (microStx: number) => (microStx / 1000000).toFixed(2)

  return (
    <div className="space-y-8">
      {/* Global Analytics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card border-blue-500">
          <div className="flex items-center">
            <Activity className="h-5 w-5 text-blue-500 mr-2" />
            <span className="text-sm font-medium">Active Streams</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">{analytics.totalActiveStreams}</p>
        </div>

        <div className="stat-card border-green-500">
          <div className="flex items-center">
            <TrendingUp className="h-5 w-5 text-green-500 mr-2" />
            <span className="text-sm font-medium">Global Volume</span>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-2">{formatStx(analytics.globalVolume)} STX</p>
        </div>

        <div className="stat-card border-purple-500">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-purple-500 mr-2" />
            <span className="text-sm font-medium">Total Users</span>
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-2">1,247</p>
        </div>

        <div className="stat-card border-orange-500">
          <div className="flex items-center">
            <TrendingUp className="h-5 w-5 text-orange-500 mr-2" />
            <span className="text-sm font-medium">Avg Stream Size</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 mt-2">{formatStx(analytics.globalVolume / analytics.totalActiveStreams)} STX</p>
        </div>
      </div>

      {/* Personal Analytics */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="card">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <BarChart3 className="h-6 w-6 mr-2 text-blue-600" />
            Your Streaming Activity
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
              <span className="font-medium">Streams Created</span>
              <span className="text-2xl font-bold text-blue-600">{analytics.totalStreamsCreated}</span>
            </div>

            <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
              <span className="font-medium">Streams Received</span>
              <span className="text-2xl font-bold text-green-600">{analytics.totalStreamsReceived}</span>
            </div>

            <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
              <span className="font-medium">STX Streamed</span>
              <span className="text-2xl font-bold text-purple-600">{formatStx(analytics.totalStxStreamed)} STX</span>
            </div>

            <div className="flex justify-between items-center p-4 bg-orange-50 rounded-lg">
              <span className="font-medium">STX Received</span>
              <span className="text-2xl font-bold text-orange-600">{formatStx(analytics.totalStxReceived)} STX</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <TrendingUp className="h-6 w-6 mr-2 text-green-600" />
            Performance Metrics
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Success Rate</h3>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-green-600 h-3 rounded-full" style={{ width: '95%' }}></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">95% of your streams completed successfully</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Average Stream Duration</h3>
              <p className="text-2xl font-bold text-blue-600">24.5 days</p>
              <p className="text-sm text-gray-600">Typical duration of your streams</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Claim Frequency</h3>
              <p className="text-2xl font-bold text-purple-600">2.3 days</p>
              <p className="text-sm text-gray-600">Average time between claims</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Gas Efficiency</h3>
              <p className="text-2xl font-bold text-green-600">87%</p>
              <p className="text-sm text-gray-600">Batch operations utilization</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <Activity className="h-6 w-6 mr-2 text-purple-600" />
          Recent Activity
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <div>
                <p className="font-medium">Stream #1 - Claim Processed</p>
                <p className="text-sm text-gray-600">2.5 STX claimed from monthly salary stream</p>
              </div>
            </div>
            <span className="text-sm text-gray-500">2 hours ago</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
              <div>
                <p className="font-medium">New Stream Created</p>
                <p className="text-sm text-gray-600">Quarterly bonus stream to employee #3</p>
              </div>
            </div>
            <span className="text-sm text-gray-500">1 day ago</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
              <div>
                <p className="font-medium">Stream Paused</p>
                <p className="text-sm text-gray-600">Monthly subscription stream paused for review</p>
              </div>
            </div>
            <span className="text-sm text-gray-500">3 days ago</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsDashboard
