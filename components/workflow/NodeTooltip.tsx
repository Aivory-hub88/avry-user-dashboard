'use client';

import React, { memo, useState, useRef, useEffect } from 'react';
import styles from './NodeTooltip.module.css';

/**
 * Props for the NodeTooltip component
 * @interface NodeTooltipProps
 * @property {string} content - The content to display in the tooltip
 * @property {React.ReactNode} children - The element that triggers the tooltip on hover
 * @property {number} [delay=500] - Delay in milliseconds before showing tooltip
 * @property {number} [maxWidth=300] - Maximum width of tooltip in pixels
 * @property {'top' | 'bottom' | 'left' | 'right'} [position='top'] - Tooltip position relative to trigger
 */
interface NodeTooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number;
  maxWidth?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * NodeTooltip Component
 *
 * Displays a tooltip with full content when hovering over truncated text or elements.
 * Supports configurable delay, positioning, and respects canvas zoom levels.
 *
 * Features:
 * - Configurable show/hide delay (default 500ms)
 * - Smart positioning to avoid viewport overflow
 * - Dark background with border styling
 * - Respects canvas zoom level
 * - Proper z-index layering
 * - Memoized for performance
 *
 * @component
 * @example
 * ```tsx
 * <NodeTooltip content="Full prompt text here" position="bottom">
 *   <div>Truncated text...</div>
 * </NodeTooltip>
 * ```
 */
const NodeTooltip = memo(
  ({
    content,
    children,
    delay = 500,
    maxWidth = 300,
    position = 'top',
  }: NodeTooltipProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<{
      top: number;
      left: number;
    }>({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Calculate tooltip position relative to trigger element
     * Adjusts position if tooltip would overflow viewport
     */
    const calculatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const padding = 8;
      let top = 0;
      let left = 0;

      // Calculate base position
      switch (position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - padding;
          left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case 'bottom':
          top = triggerRect.bottom + padding;
          left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case 'left':
          top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.left - tooltipRect.width - padding;
          break;
        case 'right':
          top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.right + padding;
          break;
      }

      // Adjust for viewport overflow
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < 0) {
        left = padding;
      } else if (left + tooltipRect.width > viewportWidth) {
        left = viewportWidth - tooltipRect.width - padding;
      }

      if (top < 0) {
        top = padding;
      } else if (top + tooltipRect.height > viewportHeight) {
        top = viewportHeight - tooltipRect.height - padding;
      }

      setTooltipPosition({ top, left });
    };

    /**
     * Handle mouse enter - show tooltip after delay
     */
    const handleMouseEnter = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, delay);
    };

    /**
     * Handle mouse leave - hide tooltip immediately
     */
    const handleMouseLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsVisible(false);
    };

    /**
     * Update tooltip position when it becomes visible
     */
    useEffect(() => {
      if (isVisible) {
        // Use requestAnimationFrame to ensure DOM is updated
        const rafId = requestAnimationFrame(() => {
          calculatePosition();
        });
        return () => cancelAnimationFrame(rafId);
      }
    }, [isVisible]);

    /**
     * Cleanup timeout on unmount
     */
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    return (
      <div
        ref={triggerRef}
        className={styles.tooltipTrigger}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}

        {isVisible && (
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              maxWidth: `${maxWidth}px`,
            }}
            role="tooltip"
            aria-hidden="false"
          >
            <div className={styles.tooltipContent}>{content}</div>
            <div className={styles.tooltipArrow} />
          </div>
        )}
      </div>
    );
  }
);

NodeTooltip.displayName = 'NodeTooltip';

export default NodeTooltip;
