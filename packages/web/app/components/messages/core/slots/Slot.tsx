import React from 'react';
import { useSlotManager } from './SlotManager';

interface SlotProps {
  name: string;
  defaultContent?: React.ReactNode;
  className?: string;
}

/**
 * Slot Component
 *
 * Renders all UI components registered for a specific slot.
 * Features can register components to appear at this slot point.
 *
 * @param name - The unique identifier for this slot
 * @param defaultContent - Content to show if no slots are registered (optional)
 * @param className - CSS classes to apply to the wrapper
 *
 * @example
 * // In your component
 * <Slot name="message-actions" />
 *
 * // In a feature
 * registerSlot('message-actions', {
 *   id: 'my-feature-action',
 *   component: MyActionButton,
 *   priority: 10
 * });
 */
export const Slot: React.FC<SlotProps> = ({ name, defaultContent, className }) => {
  const { getSlots, hasSlots } = useSlotManager();
  const slots = getSlots(name);

  // If there are replacement slots, only render those
  const replacementSlots = slots.filter((slot) => slot.replace);
  const regularSlots = slots.filter((slot) => !slot.replace);

  if (replacementSlots.length > 0) {
    // Only render replacement slots
    return (
      <div className={className} data-slot={name}>
        {replacementSlots.map((slot) => {
          const Component = slot.component;
          return <Component key={slot.id} {...(slot.props || {})} />;
        })}
      </div>
    );
  }

  // Render regular slots + default content
  if (!hasSlots(name) && !defaultContent) {
    return null;
  }

  return (
    <div className={className} data-slot={name}>
      {regularSlots.map((slot) => {
        const Component = slot.component;
        return <Component key={slot.id} {...(slot.props || {})} />;
      })}
      {defaultContent}
    </div>
  );
};
