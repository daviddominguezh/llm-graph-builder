export enum MediaFileKind {
  MP4 = 'mp4',
  PDF = 'pdf',
  JPG = 'jpg',
  PNG = 'png',
  JPEG = 'jpeg',
  GIF = 'gif',
  WEBM = 'webm',
  MP3 = 'mp3',
  OGG = 'ogg',
  M4A = 'm4a',
}

export enum MediaStatus {
  PENDING = 'pending',
  READY = 'ready',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
}

export interface MediaFile {
  id: string;
  name: string;
  link: string;
  kind: MediaFileKind;
  status: MediaStatus;
}

export interface MediaFileDetail extends MediaFile {
  file?: File;
  progress?: number;
  description?: string;
  path?: string;
  folder?: string | null;
}

export interface MediaFolder {
  name: string;
  mediaCount: number;
}

export type GroupedMediaFiles = {
  ungrouped: MediaFileDetailList;
  folders: Record<string, MediaFileDetailList>;
};

export type MediaFileList = Record<string, MediaFile>;
export type MediaFileDetailList = Record<string, MediaFileDetail>;
