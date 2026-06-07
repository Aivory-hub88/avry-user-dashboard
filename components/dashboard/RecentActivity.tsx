import Link from "next/link"
import { ActivityEvent } from "@/types/dashboard"
import styles from "./RecentActivity.module.css"

interface RecentActivityProps {
  events?: ActivityEvent[] | null
}

// ADDED: EVENT ICONS — type-specific SVG
function EventIcon({ type }: { type: string }) {
  const cls = `${styles.eventIconWrap} ${styles[type] ?? ''}`
  if (type === 'diagnostic') return (
    <div className={cls}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    </div>
  )
  if (type === 'blueprint') return (
    <div className={cls}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/>
      </svg>
    </div>
  )
  if (type === 'workflow') return (
    <div className={cls}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    </div>
  )
  return (
    <div className={cls}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
  )
}

export default function RecentActivity({ events }: RecentActivityProps) {
  // Ensure events is always an array
  const eventList = Array.isArray(events) ? events : []
  
  return (
    <div className={styles.activityContainer}>
      {/* ADDED: HEADER ROW with icon */}
      <div className={styles.headerRow}>
        <div className={styles.headerIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h3 className={styles.title}>Recent Activity</h3>
      </div>

      <div className={styles.eventList}>
        {eventList.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className={styles.emptyText}>No recent activity — start with Diagnostics</p>
          </div>
        ) : (
          eventList.slice(0, 5).map((event) => (
            <div key={event.id} className={styles.event}>
              <EventIcon type={event.type} />
              <div className={styles.eventContent}>
                <p className={styles.eventMessage}>{event.message}</p>
                <span className={styles.eventTime}>{event.timestamp}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {eventList.length > 0 && (
        <Link href="/logs" className={styles.viewAll}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
          View All Activity
        </Link>
      )}
    </div>
  )
}
