import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from 'react-nice-avatar';

import { Filter, FlaskConical, Search, X } from 'lucide-react';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';

import { generateAvatarConfig } from '@globalUtils/avatar';
import { useIsMobile } from '@globalUtils/device';

import { Collaborator } from '@globalTypes/projectInnerSettings';

import { ChatbotLabModal } from './components/ChatbotLabModal';

interface ChatsSearchProps {
  onChange: (searchTerm: string) => void;
  onClear: () => void;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
  onStatusFilterChange?: (status: string) => void;
  onAssigneeFilterChange?: (assignee: string) => void;
}

export const ChatsSearch = ({
  onChange,
  onClear,
  collaborators = [],
  profilePictures = new Map(),
  onStatusFilterChange,
  onAssigneeFilterChange,
}: ChatsSearchProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all');
  const [teammateFilter, setTeammateFilter] = useState('none');
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);

  // Notify parent when status filter changes
  useEffect(() => {
    if (onStatusFilterChange) {
      onStatusFilterChange(searchFilter);
    }
  }, [searchFilter, onStatusFilterChange]);

  // Notify parent when assignee filter changes
  useEffect(() => {
    if (onAssigneeFilterChange) {
      onAssigneeFilterChange(teammateFilter);
    }
  }, [teammateFilter, onAssigneeFilterChange]);

  const handleClear = () => {
    setSearch('');
    setIsExpanded(false);
    onClear();
  };

  const handleSearchClick = () => {
    setIsExpanded(true);
  };

  // Get the selected teammate for displaying their profile pic
  const selectedTeammate = collaborators.find((c) => c.email === teammateFilter);
  const selectedTeammatePicture = selectedTeammate ? profilePictures.get(selectedTeammate.email) : null;
  const selectedTeammateAvatar = selectedTeammate ? generateAvatarConfig(selectedTeammate.email) : null;

  return (
    <div className="h-[46px] px-4 border-b-1 flex w-full items-center justify-between gap-2 border-b border-gray-200 pb-0">
      {/* Status filter select - always visible */}
      <Select value={searchFilter} onValueChange={setSearchFilter}>
        <SelectTrigger className="w-fit border-0 shadow-none px-0 gap-1 cursor-pointer [&_span]:text-sm [&_span]:text-black [&_span]:font-semibold focus-visible:ring-0 focus-visible:border-0 [&_svg]:!text-black [&_svg]:!opacity-100">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem className="cursor-pointer" value="all">
            {t('All')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="unanswered">
            {t('Unanswered')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="open">
            {t('Opened')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="blocked">
            {t('Blocked')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="closed">
            {t('Closed')}
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Right side container: teammate filter + search */}
      <div className="flex items-center gap-2">
        {/* Search bar - expanded state */}
        {isExpanded ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onChange(search.toLowerCase());
            }}
          >
            <div className="relative">
              <Input
                placeholder={t('Search chats by phone or message...')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value || '');
                  onChange((e.target.value || '').toLowerCase());
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </form>
        ) : (
          /* Search icon - collapsed state */
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 cursor-pointer"
            onClick={handleSearchClick}
          >
            <Search className="h-5! w-5!" strokeWidth={2} />
          </Button>
        )}

        {/* Teammate filter select */}
        <Select value={teammateFilter} onValueChange={setTeammateFilter}>
          <SelectTrigger className="w-fit border-0 shadow-none px-0 gap-0 cursor-pointer [&_svg[class*=chevron]]:hidden focus-visible:ring-0 focus-visible:border-0">
            {selectedTeammate ? (
              selectedTeammatePicture ? (
                <img
                  src={selectedTeammatePicture}
                  alt={selectedTeammate.name}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <Avatar {...selectedTeammateAvatar} className="rounded-full w-5 h-5 min-w-5" />
              )
            ) : (
              <Filter className="h-5! w-5! text-black" strokeWidth={2} />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="cursor-pointer" value="none">
              {t('No filter')}
            </SelectItem>
            {collaborators.map((collaborator) => {
              const pictureUrl = profilePictures.get(collaborator.email);
              const avatarConfig = generateAvatarConfig(collaborator.email);

              return (
                <SelectItem className="cursor-pointer" key={collaborator.email} value={collaborator.email}>
                  <div className="flex items-center gap-2">
                    {pictureUrl ? (
                      <img
                        src={pictureUrl}
                        alt={collaborator.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <Avatar {...avatarConfig} className="rounded-full w-5 h-5 min-w-5" />
                    )}
                    <span>{collaborator.name}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Flask icon button - mobile only */}
        {isMobile && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 cursor-pointer"
            aria-label={t('Lab features')}
            onClick={() => setIsLabModalOpen(true)}
          >
            <FlaskConical className="h-5! w-5!" strokeWidth={2} />
          </Button>
        )}
      </div>

      {isMobile && <ChatbotLabModal open={isLabModalOpen} onOpenChange={setIsLabModalOpen} />}
    </div>
  );
};
