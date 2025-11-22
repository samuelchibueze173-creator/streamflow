import { Zap } from 'lucide-react'

const Header = () => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">StreamFlow</h1>
          </div>
          <nav className="hidden md:flex space-x-6">
            <a href="#dashboard" className="text-gray-600 hover:text-blue-600 transition-colors">Dashboard</a>
            <a href="#streams" className="text-gray-600 hover:text-blue-600 transition-colors">Streams</a>
            <a href="#analytics" className="text-gray-600 hover:text-blue-600 transition-colors">Analytics</a>
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header
