import type { Collaborator } from '@/app/types/projectInnerSettings';

/**
 * Represents a mention in the message text
 */
export interface Mention {
  /** The display name shown in the text (e.g., "John Doe") */
  name: string;
  /** The email address of the mentioned person (hidden metadata) */
  email: string;
  /** Start position of the mention in the text */
  startIndex: number;
  /** End position of the mention in the text */
  endIndex: number;
}

/**
 * Props for the MentionDialog component
 */
export interface MentionDialogProps {
  /** List of collaborators to display */
  collaborators: Collaborator[];
  /** Current search query (text after @) */
  query: string;
  /** Callback when a collaborator is selected */
  onSelect: (collaborator: Collaborator) => void;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Position for the dialog (optional, for future use) */
  position?: {
    top: number;
    left: number;
  };
}

/**
 * Represents a pending image attachment selected by the user
 * but not yet uploaded to Firebase (deferred until send)
 */
export interface PendingImageAttachment {
  /** Unique identifier for the message */
  id: string;
  /** Raw File object for deferred Firebase upload */
  file: File;
  /** Original file name */
  fileName: string;
  /** Local blob URL for preview (created via URL.createObjectURL) */
  previewUrl: string;
}

/**
 * State for tracking active mention input
 */
export interface MentionState {
  /** Whether a mention dialog is currently active */
  isActive: boolean;
  /** The search query being typed after @ */
  query: string;
  /** Start position of the @ symbol in the text */
  startIndex: number;
}
