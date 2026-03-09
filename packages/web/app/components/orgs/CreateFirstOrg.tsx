'use client';

import { useState } from 'react';

import { CreateOrgDialog } from './CreateOrgDialog';

export function CreateFirstOrg() {
  const [open, setOpen] = useState(true);

  return <CreateOrgDialog open={open} onOpenChange={setOpen} dismissible={false} />;
}
