import { FreeDiagnosticQuestion } from '@/types/freeDiagnostic'
import styles from './QuestionCard.module.css'

interface QuestionCardProps {
  question: FreeDiagnosticQuestion
  selectedOption: number | null
  onSelect: (optionIndex: number) => void
}

export default function QuestionCard({
  question,
  selectedOption,
  onSelect
}: QuestionCardProps) {
  return (
    <div className={styles.questionCard} role="group" aria-labelledby="question-text">
      <h3 id="question-text" className={styles.questionText}>{question.question}</h3>
      <div className={styles.optionsContainer} role="radiogroup" aria-labelledby="question-text">
        {question.options.map((option, index) => (
          <button
            key={index}
            className={`${styles.optionButton} ${selectedOption === index ? styles.selected : ''}`}
            onClick={() => onSelect(index)}
            type="button"
            role="radio"
            aria-checked={selectedOption === index}
            aria-label={option}
          >
            <span className={styles.optionText}>{option}</span>
            {selectedOption === index && (
              <span className={styles.checkmark}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
