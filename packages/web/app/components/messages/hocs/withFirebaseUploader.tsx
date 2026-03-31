
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { getFileDescription, setMediaUploaded } from '@/app/components/messages/services/api';
import { uploadFile } from '@/app/components/messages/services/firebase';

import MediaFileList from '@/app/components/messages/shared/stubs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { getMediaKind } from '@/app/components/messages/shared/utilStubs';

import { MediaFileDetail, MediaFileDetailList, MediaStatus } from '@/app/types/media';

// Interface that child components must implement
interface WithHandleChangeProps {
  handleChange: (files: FileList) => void;
}

// Type for React elements that have handleChange prop
type ReactElementWithHandleChange = React.ReactElement<WithHandleChangeProps>;

interface WithFirebaseUploaderProps {
  children: ReactElementWithHandleChange | ReactElementWithHandleChange[];
  projectName: string;
  onFilesChange: (files: MediaFileDetailList, finished?: boolean) => void;
  groupName: string;
  onClose: () => void;
  analyzeFiles?: boolean;
  /** When provided, single image files are passed to this callback instead of uploading.
   *  The dialog closes immediately and the parent handles the raw file. */
  onImageFilePicked?: (file: File, fileName: string, fileId: string) => void;
}

const WithFirebaseUploader: React.FC<WithFirebaseUploaderProps> = ({
  children,
  projectName,
  onFilesChange,
  groupName,
  onClose,
  analyzeFiles = false,
  onImageFilePicked,
}) => {
  const [isUploaded, setIsUploaded] = useState(false);
  // Counter used as a stable React key for MediaFileList; increments each time files change
  const [uploadCounter, setUploadCounter] = useState(0);

  const [files, setFiles] = useState<MediaFileDetailList | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const t = useTranslations('messages');

  const onFileUpdate = (fileId: string, progress: number) => {
    setFiles((prev) => {
      if (!prev) return null;
      const specificFile: MediaFileDetail = { ...prev[fileId], progress };
      return { ...prev, [fileId]: specificFile };
    });
  };

  const onConfirmUpload = async () => {
    if (!files) return;

    setFiles((prev) => {
      if (!prev) return null;
      const filesCopy: MediaFileDetailList = JSON.parse(JSON.stringify(prev));
      Object.keys(filesCopy).forEach((fileId) => {
        const mFile = filesCopy[fileId];
        mFile.status = MediaStatus.UPLOADING;
      });
      return filesCopy;
    });

    const promises: Promise<MediaFileDetail>[] = [];
    Object.keys(files).forEach((fileId) => {
      const mFile = files[fileId];
      promises.push(uploadFile(groupName, projectName, mFile.id, mFile, onFileUpdate));
    });

    const results = await Promise.allSettled(promises);

    setFiles((prev) => {
      if (!prev) return null;
      const filesCopy: MediaFileDetailList = JSON.parse(JSON.stringify(prev));
      Object.keys(filesCopy).forEach((fileId) => {
        const mFile = filesCopy[fileId];
        mFile.status = MediaStatus.PROCESSING;
        mFile.progress = 0;
      });
      return filesCopy;
    });

    const mFiles: MediaFileDetailList = {};
    const mFilesDuplicate: MediaFileDetailList = {};
    const promisesDesc: Promise<{ data: { content: string }; id: string } | null>[] = [];
    results.forEach((promise) => {
      if (promise.status !== 'fulfilled') return;
      const mFile = promise.value;
      mFiles[mFile.id] = mFile;
      mFilesDuplicate[mFile.id] = mFile;
      if (analyzeFiles)
        promisesDesc.push(getFileDescription(projectName, mFile.kind, mFile.link, mFile.id, mFile));
    });
    onFilesChange(mFiles);

    const fbPromises: Promise<void>[] = [];
    const resultsDesc = await Promise.allSettled(promisesDesc);

    setFiles((prev) => {
      if (!prev) return null;
      const filesCopy: MediaFileDetailList = JSON.parse(JSON.stringify(prev));
      Object.keys(filesCopy).forEach((fileId) => {
        const mFile = filesCopy[fileId];
        mFile.status = MediaStatus.READY;
      });
      return filesCopy;
    });

    resultsDesc.forEach((promise) => {
      if (promise.status !== 'fulfilled') return;
      if (!promise.value) return;
      const mVal = promise.value;
      const mId = mVal.id;
      const { content } = mVal.data;
      const mFile = mFilesDuplicate[mId];
      if (!mFile) return;
      mFile.description = content;
      mFile.status = MediaStatus.READY;
      fbPromises.push(setMediaUploaded(groupName, projectName, mFile.id, mFile as never));
    });

    onFilesChange(mFilesDuplicate);
    await Promise.allSettled(fbPromises);
    onFilesChange(mFilesDuplicate, true);
    onClose();
  };

  const handleFileChanges = (selectedFiles: FileList) => {
    if (selectedFiles.length === 0) return;

    // When onImageFilePicked is provided, intercept single image files
    // and pass them directly to the parent without uploading
    if (onImageFilePicked && selectedFiles.length === 1) {
      const file = selectedFiles[0];
      if (file.type.startsWith('image/') && file.size <= 1000 * 1000 * 15) {
        const id = uuidv4();
        onImageFilePicked(file, file.name, id);
        onClose();
        return;
      }
    }

    setIsUploaded(true);
    setUploadCounter((prev) => prev + 1);
    const mFiles: MediaFileDetailList = {};
    let mustShowWarning = false;
    let validFilesCount = 0;
    for (const file of selectedFiles) {
      if (file.size > 1000 * 1000 * 15) {
        mustShowWarning = true;
        continue;
      }
      validFilesCount++;
      const id = uuidv4();
      mFiles[id] = {
        id,
        file,
        name: file.name,
        link: '',
        kind: getMediaKind(file.name),
        status: MediaStatus.PENDING,
      };
    }
    setFiles(mFiles);
    if (mustShowWarning) toast.error(t('Error: One of your files exceeds the 15 MB limit'));
    if (validFilesCount === 0) setIsUploaded(false);
  };

  const onRemovefile = (id: string) => {
    if (!files) return;
    const filesCopy: MediaFileDetailList = JSON.parse(JSON.stringify(files));
    delete filesCopy[id];
    setFiles(filesCopy);
    const shouldCloseFilePreviewer = Object.keys(filesCopy).length === 0;
    if (shouldCloseFilePreviewer) setIsUploaded(false);
  };

  // Function to recursively clone children and intercept handleChange
  const enhanceChildren = (
    children: ReactElementWithHandleChange | ReactElementWithHandleChange[]
  ): React.ReactNode => {
    return React.Children.map(children, (child) => {
      if (!React.isValidElement<WithHandleChangeProps>(child)) {
        return child;
      }

      // Now we can safely access props without type assertion
      const originalHandleChange = child.props.handleChange;

      // Create enhanced handleChange that logs and then calls original
      const enhancedHandleChange = (files: FileList) => {
        handleFileChanges(files);
        // Call the original handleChange
        if (originalHandleChange && typeof originalHandleChange === 'function') originalHandleChange(files);
      };

      // Clone the element with the enhanced handleChange
      return React.cloneElement(child, {
        ...child.props,
        handleChange: enhancedHandleChange,
      });
    });
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[425px] flex flex-col"
        aria-describedby="Modal to upload media"
      >
        <DialogHeader>
          <DialogTitle>{t('Upload media')}</DialogTitle>
        </DialogHeader>
        <div style={{ width: '100%' }}>
          {isUploaded ? (
            <MediaFileList
              key={`upload-${uploadCounter}`}
              files={files || undefined}
              fromUploader={true}
              onRemovefile={onRemovefile}
            />
          ) : (
            enhanceChildren(children)
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onClose()} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => {
              setIsLoading(true);
              onConfirmUpload();
            }}
            disabled={isLoading}
            style={{
              backgroundColor: '#111111',
              borderColor: '#111111',
              color: 'white',
              fontWeight: '500',
              fontSize: '0.95rem',
              borderRadius: '4px',
            }}
          >
            {isLoading ? t('Uploading...') : t('Upload')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WithFirebaseUploader;
