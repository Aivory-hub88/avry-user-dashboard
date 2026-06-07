'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function WorkflowDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workflowId = (params?.id as string) || ''

  useEffect(() => {
    // Redirect to /workflows?selected={id} to use the unified workflows viewer
    if (workflowId) {
      router.replace(`/workflows?selected=${encodeURIComponent(workflowId)}`)
    }
  }, [workflowId, router])

  return null
}
