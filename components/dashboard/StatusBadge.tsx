import styles from "./StatusBadge.module.css"

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'not_started':
        return 'Not Started'
      case 'in_progress':
        return 'In Progress'
      case 'completed':
        return 'Completed'
      case 'none':
        return 'None'
      case 'draft':
        return 'Draft'
      case 'active':
        return 'Active'
      default:
        return status
    }
  }

  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      {getStatusLabel(status)}
    </span>
  )
}
