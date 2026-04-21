export interface DriveItem {
  id: string;
  name: string;
  parents?: string[];
  iconLink: string;
  mimeType: string;
  webViewLink: string;
  isSharedDrive: boolean;
}

export interface DriveFileSearchResult extends DriveItem {
  isRootLevel: boolean;
  parentFolderId?: string;
  parentFolderName?: string;
}

export interface DriveSearchResults {
  files: DriveFileSearchResult[];
  folderPaths: Record<string, string[]>;
  foldersToExpand: string[];
}

export interface FetchFilesOptions {
  folderId?: string | null;
  includeShared: boolean;
  includeSharedDrives: boolean;
  fetchAll: boolean;
  refresh?: boolean;
}

export interface FileFetchingStatus {
  status: string;
  message: string;
  progress: number;
  requestId: string;
  processedItems: number;
  totalItems: number;
  totalPages: number;
  data: FileFetchingData | null;
}

export interface DriveSegment {
  files: string[];
  folders: string[];
}

export interface DriveSegmentDetail {
  files: DriveItem[];
  folders: DriveItem[];
}

export type FolderContent = Record<string, DriveSegment>;

export interface SynchedFiles {
  fileIds: Record<string, string>;
  folderIds: string[];
}

export interface FileFetchingData extends DriveSegmentDetail {
  sync: SynchedFiles;
  webhooks: {
    fileIds: string[];
  };
  folderContents: FolderContent;
  currentFolder: string;
}

export interface FolderTree {
  info: DriveItem;
  files: DriveItem[];
  subFolders: DriveItem[];
  loaded: boolean;
  parentId?: string | null;
  fetchTime?: string;
}

export interface DriveLocalCache {
  files: DriveItem[];
  folders: DriveItem[];
  folderContents: FolderContent;
  sync: SynchedFiles;
  timestamp: number;
}
