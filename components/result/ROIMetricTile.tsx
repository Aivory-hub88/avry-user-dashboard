import styles from './ROIMetricTile.module.css'

interface ROIMetricTileProps {
  label: string
  value: number | null
  formatter: (value: number) => string
  subtitle?: string
}

export default function ROIMetricTile({ label, value, formatter, subtitle }: ROIMetricTileProps) {
  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      {value === null ? (
        <span className={styles.insufficient}>Insufficient data</span>
      ) : (
        <span className={styles.value} style={value < 0 ? { color: '#f87171' } : undefined}>
          {formatter(value)}
        </span>
      )}
    </div>
  )
}
