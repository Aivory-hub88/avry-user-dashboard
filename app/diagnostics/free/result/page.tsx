'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FreeDiagnosticResult } from '@/types/freeDiagnostic'
import { FreeDiagnosticService } from '@/services/freeDiagnostic'
import ScoringCard from '@/components/diagnostics/ScoringCard'
import styles from './result.module.css'

export default function FreeDiagnosticResultPage() {
  const router = useRouter()
  const [result, setResult] = useState<FreeDiagnosticResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedResult = FreeDiagnosticService.getResult()
    
    if (!storedResult) {
      // No result found, redirect to diagnostic
      router.push('/diagnostics/free')
      return
    }

    setResult(storedResult)
    setIsLoading(false)
  }, [router])

  if (isLoading || !result) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading your results...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageContent}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Your AI Readiness Score</h1>
        </header>

        <ScoringCard result={result} />

        <div className={styles.narrativeSection}>
          <h3 className={styles.narrativeTitle}>What This Means</h3>
          <div className={styles.narrativeText}>
            {result.narrative.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className={styles.ctaSection}>
          <Link href="/diagnostics" className={styles.primaryCta}>
            Continue to Deep Diagnostic
          </Link>
          <Link href="/blueprint" className={styles.secondaryCta}>
            See how AI System Blueprint works
          </Link>
          <button
            className={styles.retakeButton}
            onClick={() => {
              FreeDiagnosticService.clearResult()
              router.push('/diagnostics/free')
            }}
          >
            Retake Diagnostic
          </button>
        </div>

        <div className={styles.actionButtons}>
          <button 
            className={styles.actionButton}
            onClick={() => alert('Download feature coming soon')}
          >
            Download Scoring Card
          </button>
          <button 
            className={styles.actionButton}
            onClick={() => {
              const summary = `AI Readiness Score: ${result.score}/100\nMaturity: ${result.maturity_level}\n\n${result.narrative}`
              navigator.clipboard.writeText(summary)
              alert('Summary copied to clipboard!')
            }}
          >
            Copy Summary
          </button>
        </div>
      </div>
    </div>
  )
}
