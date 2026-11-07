'use client'

import ChatDiagnostic from '@/components/diagnostics/chat/ChatDiagnostic'
import DiagnosticErrorBoundary from '@/components/diagnostics/DiagnosticErrorBoundary'

export default function DeepDiagnosticChatPage() {
  return (
    <DiagnosticErrorBoundary>
      <ChatDiagnostic />
    </DiagnosticErrorBoundary>
  )
}
