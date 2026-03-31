'use client';

import { useCallback } from 'react';

import MessagesDashboard from '@/app/components/messages';

export default function ChatsPage(): React.JSX.Element {
  const handleSidebarChange = useCallback(() => {
    /* sidebar managed by OrgSidebar */
  }, []);

  return (
    <div className="h-full overflow-hidden">
      <MessagesDashboard onChangeSidebar={handleSidebarChange} />
    </div>
  );
}
