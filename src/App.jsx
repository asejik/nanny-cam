import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [connectionStatus, setConnectionStatus] = useState('Checking connection...')

  useEffect(() => {
    async function checkSupabase() {
      // Try to fetch data from the 'rooms' table (even if empty, it tests the connection)
      const { data, error } = await supabase.from('rooms').select('*')

      if (error) {
        console.error('Supabase error:', error)
        setConnectionStatus('Connection Failed (Check console)')
      } else {
        setConnectionStatus('Connected to Supabase successfully!')
      }
    }
    checkSupabase()
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-blue-600">Nanny Cam Setup</h1>
        <p className="text-gray-700">{connectionStatus}</p>
      </div>
    </div>
  )
}

export default App