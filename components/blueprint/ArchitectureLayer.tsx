import styles from './ArchitectureLayer.module.css'

interface ArchitectureLayerProps {
  title: string
  items: string[]
  description: string
  accentColor?: string
}

export default function ArchitectureLayer({
  title,
  items,
  description,
  accentColor = 'rgba(255, 255, 255, 0.1)'
}: ArchitectureLayerProps) {
  return (
    <div className={styles.layerCard} style={{ borderLeftColor: accentColor }}>
      <h3 className={styles.layerTitle}>{title}</h3>
      
      <div className={styles.itemsContainer}>
        {items.map((item, index) => (
          <div key={index} className={styles.itemChip}>
            {item}
          </div>
        ))}
      </div>

      <p className={styles.layerDescription}>{description}</p>
    </div>
  )
}
