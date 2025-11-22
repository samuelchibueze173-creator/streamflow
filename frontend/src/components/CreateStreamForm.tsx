import { useState } from 'react'
import { Plus, Calculator } from 'lucide-react'

interface CreateStreamFormProps {
  userSession?: any
}

const CreateStreamForm = (props?: CreateStreamFormProps) => {
  const [recipient, setRecipient] = useState('')
  const [btcRate, setBtcRate] = useState('')
  const [duration, setDuration] = useState('')
  const [cliffDuration, setCliffDuration] = useState('')
  const [deposit, setDeposit] = useState('')
  const [useTemplate, setUseTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const templates = [
    { id: 'monthly-salary', name: 'Monthly Salary', btcRate: 1000, duration: 2592000, cliff: 0 },
    { id: 'quarterly-bonus', name: 'Quarterly Bonus', btcRate: 5000, duration: 7776000, cliff: 2592000 },
    { id: 'subscription', name: 'Monthly Subscription', btcRate: 100, duration: 2592000, cliff: 0 },
  ]

  const calculateEstimatedCost = () => {
    if (!btcRate || !duration) return 0
    const rate = parseFloat(btcRate)
    const dur = parseFloat(duration)
    if (isNaN(rate) || isNaN(dur)) return 0

    // This is a simplified calculation - in reality would need current BTC/STX rate
    const estimatedStxPerBtc = 50000000 // 50 STX per BTC
    const totalSatoshis = rate * dur
    const totalStx = (totalSatoshis * estimatedStxPerBtc) / 100000000 // Convert satoshis to BTC, then to STX

    return totalStx / 1000000 // Convert to STX
  }

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setBtcRate(template.btcRate.toString())
      setDuration(template.duration.toString())
      setCliffDuration(template.cliff.toString())
      setSelectedTemplate(templateId)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement stream creation with Stack.js
    console.log('Creating stream:', {
      recipient,
      btcRate: parseInt(btcRate),
      duration: parseInt(duration),
      cliffDuration: parseInt(cliffDuration),
      deposit: parseInt(deposit) * 1000000 // Convert STX to microSTX
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 flex items-center">
          <Plus className="h-6 w-6 mr-2 text-blue-600" />
          Create New Payment Stream
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selection */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={useTemplate}
                onChange={(e) => setUseTemplate(e.target.checked)}
                className="mr-2"
              />
              Use Stream Template
            </label>

            {useTemplate && (
              <div className="mt-3">
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Recipient Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="ST..."
              className="input-field"
              required
            />
          </div>

          {/* BTC Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              BTC Rate (satoshis per second)
            </label>
            <input
              type="number"
              value={btcRate}
              onChange={(e) => setBtcRate(e.target.value)}
              placeholder="1000"
              className="input-field"
              min="1"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              How many satoshis per second should be streamed
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="2592000"
              className="input-field"
              min="1"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Total duration of the stream in seconds (30 days = 2,592,000)
            </p>
          </div>

          {/* Cliff Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cliff Duration (seconds)
            </label>
            <input
              type="number"
              value={cliffDuration}
              onChange={(e) => setCliffDuration(e.target.value)}
              placeholder="0"
              className="input-field"
              min="0"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Initial period where no funds can be claimed (0 = no cliff)
            </p>
          </div>

          {/* Deposit Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deposit Amount (STX)
            </label>
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="10.0"
              className="input-field"
              min="0.001"
              step="0.001"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Total STX to deposit for the stream
            </p>
          </div>

          {/* Cost Estimation */}
          {(btcRate && duration) && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Calculator className="h-5 w-5 text-blue-600 mr-2" />
                <h3 className="font-semibold text-blue-900">Cost Estimation</h3>
              </div>
              <div className="text-sm text-blue-800">
                <p>Estimated total value: {calculateEstimatedCost().toFixed(4)} STX</p>
                <p className="text-xs mt-1">
                  Based on current BTC/STX rate. Actual amount may vary with market conditions.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full btn-primary"
            disabled={!recipient || !btcRate || !duration || !cliffDuration || !deposit}
          >
            Create Payment Stream
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">How Payment Streams Work</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Funds are locked in the contract and released continuously over time</li>
            <li>• Recipient can claim available funds at any time after the cliff period</li>
            <li>• Streams can be paused/resumed by the sender</li>
            <li>• Unclaimed funds can be recovered by the sender after stream ends</li>
            <li>• BTC-denominated rates are converted to STX at claim time</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CreateStreamForm
