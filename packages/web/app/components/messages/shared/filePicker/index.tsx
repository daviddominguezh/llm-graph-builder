import React from 'react';
import { FileUploader } from 'react-drag-drop-files';
import { useTranslation } from 'react-i18next';

import styles from './index.module.css';

interface FilePickerProps {
  types: string[];
  multiple?: boolean;
  label?: string;
  handleChange?: (files: File | File[]) => void;
}

const FilePicker: React.FC<FilePickerProps> = ({
  types,
  multiple = false,
  label,
  handleChange,
}) => {
  const { t } = useTranslation();
  const displayLabel = label || t('Drag files here or browse');

  return (
    <FileUploader
      classes={styles['file-picker']}
      multiple={multiple}
      handleChange={(files: File | File[]) => {
        if (handleChange) handleChange(files);
      }}
      types={types}
      label={displayLabel}
      uploadedLabel={displayLabel}
    />
  );
};

export default FilePicker;
