import React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Node configuration for AI starting point
 */
interface Node {
  nodeId: string;
  description: string;
}

/**
 * NodeSelectionModal component for selecting AI starting node
 */
interface NodeSelectionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node[];
  selectedNode: string;
  onNodeChange: (nodeId: string) => void;
  onConfirm: (nodeId: string) => void;
}

export const NodeSelectionModal: React.FC<NodeSelectionModalProps> = ({
  isOpen,
  onOpenChange,
  nodes,
  selectedNode,
  onNodeChange,
  onConfirm,
}) => {
  const t = useTranslations('messages');

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset selection when closing without confirming
      onNodeChange('');
    }
    onOpenChange(open);
  };

  const handleConfirm = () => {
    if (selectedNode) {
      onConfirm(selectedNode);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full lg:max-w-[750px]"
        aria-describedby="Modal to select AI starting node"
      >
        <DialogHeader>
          <DialogTitle>{t('Select AI Starting Node')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 overflow-hidden w-full">
          <div className="text-gray-600">{t('Please select the node where the AI should start:')}</div>

          <Select value={selectedNode} onValueChange={(value) => value && onNodeChange(value)}>
            <SelectTrigger className="cursor-pointer w-full! truncate!">
              <SelectValue
                className="truncate! w-full! overflow-hidden"
                placeholder={t('Select a node')}
              />
            </SelectTrigger>
            <SelectContent className="w-[calc(100vw-calc(2px+var(--tw-spacing)*20))] lg:w-[calc(750px_-_(calc(2px+var(--tw-spacing)*12)))]">
              {nodes.map((node) => (
                <SelectItem
                  className="cursor-pointer border-b rounded-none"
                  key={node.nodeId}
                  value={node.nodeId}
                >
                  {node.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onNodeChange('');
              onOpenChange(false);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedNode}
            style={{
              backgroundColor: '#111111',
              borderColor: '#111111',
              color: 'white',
              fontWeight: '500',
              fontSize: '0.95rem',
              borderRadius: '4px',
            }}
          >
            {t('Continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

NodeSelectionModal.displayName = 'NodeSelectionModal';
