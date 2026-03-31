import React from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

interface PendingImagePreviewProps {
  /** URL of the uploaded image to preview */
  imageUrl: string;
  /** File name for alt text */
  fileName: string;
  /** Callback when user clicks the remove button */
  onRemove: () => void;
}

/**
 * Shows a small thumbnail preview of a pending image attachment
 * with an X button to remove it before sending
 */
export const PendingImagePreview: React.FC<PendingImagePreviewProps> = ({
  imageUrl,
  fileName,
  onRemove,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200">
      <div className="relative shrink-0">
        <img
          src={imageUrl}
          alt={fileName}
          className="w-16 h-16 object-cover rounded-md border border-gray-200"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-900 transition-colors"
          title={t('Remove image')}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

PendingImagePreview.displayName = 'PendingImagePreview';
