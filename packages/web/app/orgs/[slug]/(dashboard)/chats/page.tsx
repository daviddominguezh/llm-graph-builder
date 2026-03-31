'use client';

import { useCallback } from 'react';

import MessagesDashboard from '@/app/components/messages';

export default function ChatsPage(): React.JSX.Element {
  const handleSidebarChange = useCallback((_val: boolean) => {
    // Sidebar visibility is managed by OrgSidebar in this app
  }, []);

  return (
    <div className="h-full overflow-hidden">
      <MessagesDashboard onChangeSidebar={handleSidebarChange} />
    </div>
  );
}
