import { useVirtualizer as tanstackUseVirtualizer } from '@tanstack/react-virtual';

export const useListVirtualizer: typeof tanstackUseVirtualizer = (options) => tanstackUseVirtualizer(options);
