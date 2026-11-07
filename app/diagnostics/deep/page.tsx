'use client'

import ChatDiagnostic from '@/components/diagnostics/chat/ChatDiagnostic'
import DiagnosticErrorBoundary from '@/components/diagnostics/DiagnosticErrorBoundary'

export default function DeepDiagnosticPage() {
  return (
    <DiagnosticErrorBoundary>
      <ChatDiagnostic />
    </DiagnosticErrorBoundary>
  )
}
