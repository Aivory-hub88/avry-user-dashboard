'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// This is the old v1 result page — redirects to the new final-result page
export default function DeepDiagnosticResultPageRedirect() {
  const router = useRouter()

  useEffect(() => {
    const hasNewContext = typeof window !== 'undefined' &&
      localStorage.getItem('aivory_diagnostic_context') !== null

    if (hasNewContext) {
      router.replace('/diagnostics/deep/final-result')
    } else {
      router.replace('/diagnostics/deep')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#1e1d1a'
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '2px solid #00e59e',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  )
}
